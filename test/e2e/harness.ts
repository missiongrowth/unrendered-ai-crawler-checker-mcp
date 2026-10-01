import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, test as base, type Browser, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { startFixtureServers, type FixtureServers } from "../fixtures/server.mjs";

export const ROOT = resolve(import.meta.dirname, "../..");
export const DIST = join(ROOT, "dist");

export interface RecordedRequest {
  url: string;
  method: string;
  fromServiceWorker: boolean;
}

export interface Extension {
  ctx: BrowserContext;
  /** CDP endpoint of the same browser; a connection made after the panel opened exposes it as a Page. */
  endpoint: string;
  /** Connections opened by `getPanel`, closed with the extension. */
  connections: Browser[];
  id: string;
  sw: Worker;
  /** Every request the browser context reports: pages, the panel and the service worker. */
  requests: RecordedRequest[];
  close: () => Promise<void>;
}

interface RawCdp {
  send: (method: string, params?: object) => Promise<unknown>;
}

interface TargetInfo {
  targetId: string;
  type: string;
  url: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chromium writes the port it picked for `--remote-debugging-port=0` to `DevToolsActivePort` in the profile. */
async function debuggingPort(profile: string): Promise<number> {
  for (let i = 0; i < 100; i++) {
    try {
      const port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      if (port > 0) return port;
    } catch {
      // not written yet
    }
    await sleep(100);
  }
  throw new Error("Chromium did not publish a debugging port");
}

export async function launchExtension(extensionDir: string): Promise<Extension> {
  const profile = mkdtempSync(join(tmpdir(), "unrendered-profile-"));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--remote-debugging-port=0"],
  });
  const requests: RecordedRequest[] = [];
  ctx.on("request", (r) => {
    requests.push({ url: r.url(), method: r.method(), fromServiceWorker: r.serviceWorker() !== null });
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  const connections: Browser[] = [];
  return {
    ctx,
    endpoint: `http://127.0.0.1:${await debuggingPort(profile)}`,
    connections,
    id: new URL(sw.url()).host,
    sw,
    requests,
    close: async () => {
      for (const c of connections) await c.close();
      await ctx.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

/**
 * Copy of dist whose manifest grants every host at install. `chrome.permissions.request`
 * then resolves without the native prompt, which automation cannot click.
 */
export function buildHostAccessCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "unrendered-hostaccess-"));
  cpSync(DIST, dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) as Record<string, unknown>;
  delete manifest["optional_host_permissions"];
  manifest["host_permissions"] = ["http://*/*", "https://*/*"];
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

/** Clicks the toolbar icon for the tab showing `page`, as in notes/spikes/run3.mjs. */
export async function clickToolbar(ext: Extension, page: Page): Promise<void> {
  await page.bringToFront();
  const browser = ext.ctx.browser();
  if (browser === null) throw new Error("the context has no browser session to send Extensions.triggerAction through");
  const cdp = (await browser.newBrowserCDPSession()) as unknown as RawCdp & { detach: () => Promise<void> };
  try {
    const { targetInfos } = (await cdp.send("Target.getTargets", { filter: [{ type: "tab" }, { type: "page" }] })) as { targetInfos: TargetInfo[] };
    const tab = targetInfos.find((t) => t.type === "tab" && t.url === page.url());
    if (tab === undefined) throw new Error(`no tab target for ${page.url()}`);
    await cdp.send("Extensions.triggerAction", { id: ext.id, targetId: tab.targetId });
  } finally {
    await cdp.detach();
  }
}

/** The side panel is only a Page on a CDP connection made after it opened, not on the launching context. */
export async function getPanel(ext: Extension, timeoutMs = 15_000): Promise<Page> {
  const isPanel = (p: Page) => p.url().startsWith(`chrome-extension://${ext.id}/panel.html`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const browser = await chromium.connectOverCDP(ext.endpoint);
    const panel = browser.contexts().flatMap((c) => c.pages()).find(isPanel);
    if (panel) {
      ext.connections.push(browser);
      return panel;
    }
    await browser.close();
    await sleep(200);
  }
  throw new Error("side panel did not open");
}

export const SETTLED_STATUSES = ["ready", "gate", "no-access", "unsupported", "error"] as const;
export type PanelStatus = (typeof SETTLED_STATUSES)[number];

/** Waits until the panel left idle/loading and returns the final `#app[data-status]`. */
export async function waitSettled(panel: Page, timeoutMs = 30_000): Promise<PanelStatus> {
  await panel.locator(SETTLED_STATUSES.map((s) => `#app[data-status="${s}"]`).join(", ")).waitFor({ timeout: timeoutMs });
  const status = await panel.locator("#app").getAttribute("data-status");
  const found = SETTLED_STATUSES.find((s) => s === status);
  if (found === undefined) throw new Error(`unexpected panel status ${String(status)}`);
  return found;
}

/** Toolbar click until the side panel shows up; the first click right after a navigation is occasionally dropped. */
export async function openPanel(ext: Extension, page: Page): Promise<Page> {
  let failure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    await clickToolbar(ext, page);
    try {
      return await getPanel(ext, 6_000);
    } catch (e) {
      failure = e;
    }
  }
  throw failure instanceof Error ? failure : new Error(String(failure));
}

/** Toolbar click, panel open, wait for the analysis to finish. */
export async function analyse(ext: Extension, page: Page, timeoutMs = 30_000): Promise<{ panel: Page; status: PanelStatus }> {
  const panel = await openPanel(ext, page);
  return { panel, status: await waitSettled(panel, timeoutMs) };
}

export interface PanelRow {
  id: string;
  state: string;
  text: string;
}

/** Text nodes are joined with spaces, so adjacent spans never glue words together. */
export function readBlockRows(panel: Page): Promise<PanelRow[]> {
  return panel.evaluate(() => {
    const textOf = (el: Element) => {
      const parts: string[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) parts.push((n as Text).data);
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    return [...document.querySelectorAll("[data-block-id]")].map((el) => ({
      id: el.getAttribute("data-block-id") ?? "",
      state: el.getAttribute("data-state") ?? "",
      text: textOf(el),
    }));
  });
}

export function readTexts(panel: Page, selector: string): Promise<string[]> {
  return panel.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.replace(/\s+/g, " ").trim()), selector);
}

export async function openTab(panel: Page, name: "Content" | "Fields" | "Bots" | "Share"): Promise<void> {
  await panel.getByRole("tab", { name, exact: true }).click();
}

export interface E2eFixtures {
  ext: Extension;
  extWithHosts: Extension;
}

export const test = base.extend<E2eFixtures, { servers: FixtureServers }>({
  servers: [
    // Playwright requires a destructured first argument even when no fixture is used.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const servers = await startFixtureServers();
      await use(servers);
      await servers.close();
    },
    { scope: "worker" },
  ],
  // eslint-disable-next-line no-empty-pattern
  ext: async ({}, use) => {
    const ext = await launchExtension(DIST);
    await use(ext);
    await ext.close();
  },
  // eslint-disable-next-line no-empty-pattern
  extWithHosts: async ({}, use) => {
    const dir = buildHostAccessCopy();
    const ext = await launchExtension(dir);
    await use(ext);
    await ext.close();
    rmSync(dir, { recursive: true, force: true });
  },
});

export { expect } from "@playwright/test";
