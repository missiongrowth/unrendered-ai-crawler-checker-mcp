// Runs the MCP analysis and the extension's own panel on the same URLs and prints both side by side.
// Usage: (cd .. && pnpm build) && pnpm build && node scripts/parity.mjs [substring ...]
// Env: PARITY_MCP_CHANNEL=chromium runs the MCP side in Playwright's Chromium instead of Google Chrome.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "playwright-core";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const HERE = resolve(import.meta.dirname, "..");
const EXTENSION_DIST = resolve(HERE, "../dist");
const SERVER = join(HERE, "dist/server.js");
const URLS = [
  "https://www.duolingo.com/",
  "https://www.twitch.tv/",
  "https://hn.algolia.com/?q=react",
  "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/article",
  "https://en.wikipedia.org/wiki/Web_crawler",
  "https://www.theguardian.com/food",
  "https://www.bbc.com/news",
  "https://edition.cnn.com/",
  "https://www.nytimes.com/",
  "https://react.dev/learn",
  "https://docs.python.org/3/tutorial/index.html",
  "https://nextjs.org/docs",
  "https://tailwindcss.com/docs/installation",
  "https://github.com/microsoft/playwright",
  "https://www.allbirds.com/",
  "https://www.ikea.com/us/en/",
  "https://www.zara.com/us/en/",
  "https://www.walmart.com/",
  "https://www.etsy.com/",
  "https://stackoverflow.com/questions/11227809",
];
const POINTS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(EXTENSION_DIST, "manifest.json"))) throw new Error("Build the extension first: pnpm build in the repo root.");
if (!existsSync(SERVER)) throw new Error("Build the MCP package first: pnpm build in mcp/.");

function hostAccessCopy() {
  const dir = mkdtempSync(join(tmpdir(), "unrendered-parity-ext-"));
  cpSync(EXTENSION_DIST, dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  delete manifest.optional_host_permissions;
  manifest.host_permissions = ["http://*/*", "https://*/*"];
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return dir;
}

async function browserUserAgent() {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    return (await (await browser.newPage()).evaluate(() => navigator.userAgent)).replace("HeadlessChrome", "Chrome");
  } finally {
    await browser.close();
  }
}

async function debuggingPort(profile) {
  for (let i = 0; i < 100; i++) {
    try {
      const port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]);
      if (port > 0) return port;
    } catch {
      await sleep(100);
    }
  }
  throw new Error("no debugging port");
}

async function openPanel(ctx, page, id, port, connections) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cdp = await ctx.browser().newBrowserCDPSession();
    const { targetInfos } = await cdp.send("Target.getTargets", { filter: [{ type: "tab" }] });
    const tab = targetInfos.find((t) => t.url === page.url());
    if (tab) await cdp.send("Extensions.triggerAction", { id, targetId: tab.targetId });
    await cdp.detach();
    for (let i = 0; i < 30; i++) {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      connections.push(browser);
      const panel = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(`chrome-extension://${id}/panel.html`));
      if (panel) return panel;
      await sleep(200);
    }
  }
  throw new Error("side panel did not open");
}

const percentOf = (text) => (text && /^\d+%$/.test(text) ? Number(text.slice(0, -1)) : null);
const wordsOf = (text) => {
  const m = text?.match(/^(\d+) of (\d+) words$/);
  return m ? { in_raw: Number(m[1]), total: Number(m[2]) } : null;
};

async function readStat(panel, metric) {
  const stat = panel.locator(`.stat:has([data-metric="${metric}"])`);
  return {
    percent: percentOf((await stat.locator("[data-metric]").textContent())?.trim()),
    words: wordsOf((await stat.locator(".stat-sub").textContent({ timeout: 500 }).catch(() => null))?.trim()),
  };
}

async function extensionRun(dir, userAgent, url) {
  const profile = mkdtempSync(join(tmpdir(), "unrendered-parity-profile-"));
  const connections = [];
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    userAgent,
    viewport: { width: 1280, height: 720 },
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`, "--remote-debugging-port=0"],
  });
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    const id = new URL(sw.url()).host;
    const port = await debuggingPort(profile);
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => undefined);
    const panel = await openPanel(ctx, page, id, port, connections);
    const settled = ["ready", "gate", "error", "no-access", "unsupported"].map((s) => `#app[data-status="${s}"]`).join(", ");
    await panel.locator(settled).waitFor({ timeout: 60_000 });
    const status = await panel.locator("#app").getAttribute("data-status");
    if (status === "gate") return { status, gate: await panel.locator("section.gate").first().getAttribute("data-gate") };
    if (status !== "ready") return { status };
    const main = await readStat(panel, "main");
    const all = await readStat(panel, "all");
    await panel.getByRole("tab", { name: "Fields", exact: true }).click();
    const fields = await panel.locator(".field-row").evaluateAll((rows) => rows.map((r) => ({ field: r.getAttribute("data-field"), state: r.getAttribute("data-field-state") })));
    return { status, main, all, fields };
  } finally {
    for (const c of connections) await c.close().catch(() => undefined);
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

async function mcpRun(client, url) {
  const res = await client.callTool({ name: "analyze_page", arguments: { url } });
  const text = res.content[0].text;
  if (res.isError) return { status: "error", error: text };
  const r = JSON.parse(text);
  if (r.gate) return { status: "gate", gate: r.gate.kind };
  const c = r.coverage;
  const side = (x) => ({ percent: x.percent, words: x.words_total === 0 ? null : { in_raw: x.words_in_raw_html, total: x.words_total } });
  return {
    status: "ready",
    main: side(c.main_content),
    all: side(c.all_visible_text),
    fields: r.fields.rows.map((f) => ({ field: f.field, state: f.state })),
    fieldCount: r.fields.changed_count,
  };
}

function compare(ext, mcp) {
  if (ext.status === "error" && mcp.status === "error") return ["both runs failed, nothing to compare"];
  if (ext.status !== mcp.status || ext.gate !== mcp.gate) return [`status ext=${ext.gate ?? ext.status} mcp=${mcp.gate ?? mcp.status}`];
  if (ext.status !== "ready") return [];
  const reasons = [];
  for (const k of ["main", "all"]) {
    const a = ext[k].percent;
    const b = mcp[k].percent;
    if ((a === null) !== (b === null) || (a !== null && b !== null && Math.abs(a - b) > POINTS)) reasons.push(`${k} coverage ext=${a}% mcp=${b}%`);
  }
  if (ext.fields.length !== mcp.fieldCount) {
    const keys = (rows) => new Set(rows.map((r) => `${r.field}:${r.state}`));
    const e = keys(ext.fields);
    const m = keys(mcp.fields);
    const onlyExt = [...e].filter((x) => !m.has(x));
    const onlyMcp = [...m].filter((x) => !e.has(x));
    reasons.push(`fields ext=${ext.fields.length} mcp=${mcp.fieldCount} (only ext: ${onlyExt.slice(0, 3).join("; ") || "-"}; only mcp: ${onlyMcp.slice(0, 3).join("; ") || "-"})`);
  }
  return reasons;
}

const cell = (side) => {
  if (side.status !== "ready") return side.gate ?? `${side.status} ${side.error ?? ""}`;
  const w = side.main.words;
  return `main ${side.main.percent ?? "none"}%${w ? ` (${w.in_raw}/${w.total} words)` : ""}, all ${side.all.percent ?? "none"}%`;
};

const only = process.argv.slice(2);
const urls = URLS.filter((u) => only.length === 0 || only.some((o) => u.includes(o)));
const dir = hostAccessCopy();
const userAgent = await browserUserAgent();
const client = new Client({ name: "parity", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: "node",
    args: [SERVER],
    env: { ...process.env, ...(process.env.PARITY_MCP_CHANNEL && { UNRENDERED_CHROME_CHANNEL: process.env.PARITY_MCP_CHANNEL }) },
  }),
);

const failed = (e) => ({ status: "error", error: String(e).slice(0, 120) });
const attempt = async (url) => {
  const ext = await extensionRun(dir, userAgent, url).catch(failed);
  const mcp = await mcpRun(client, url).catch(failed);
  return { ext, mcp, reasons: compare(ext, mcp) };
};

let matched = 0;
for (const url of urls) {
  let result = await attempt(url);
  let note = "";
  if (result.reasons.length > 0) {
    result = await attempt(url);
    note = result.reasons.length === 0 ? " (differed on first run, matched on retry: live variance)" : " (persists on retry)";
  }
  if (result.reasons.length === 0) matched++;
  const { ext, mcp, reasons } = result;
  console.log(
    `${reasons.length === 0 ? "MATCH" : "DIFF "} ${url}${reasons.length === 0 ? note : ""}\n   ext: ${cell(ext)} | changed fields ${ext.fields?.length ?? "-"}\n   mcp: ${cell(mcp)} | changed fields ${mcp.fieldCount ?? "-"}${reasons.length ? `\n   why: ${reasons.join(" / ")}${note}` : ""}`,
  );
}
await client.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${matched}/${urls.length} MATCH (main and all coverage within ${POINTS} points, same gate, same changed-field count)`);
