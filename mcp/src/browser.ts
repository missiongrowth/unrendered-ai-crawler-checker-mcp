import { readFile } from "node:fs/promises";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { analyze } from "../../src/core/analyze";
import type { botReport } from "../../src/core/botcheck";
import { CORE_FN } from "./globals";

type Core = { analyze: typeof analyze; botReport: typeof botReport };

const CHANNEL = process.env["UNRENDERED_CHROME_CHANNEL"] ?? "chrome";
const bundle = (name: string) => readFile(new URL(`./${name}`, import.meta.url), "utf8");

const NOT_FOUND = /Executable doesn't exist|is not found|distribution|ENOENT/i;

export interface ChromeSession {
  browser: Browser;
  /** The browser's own user-agent without the "Headless" marker, which sites treat as a bot. */
  userAgent: string;
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: CHANNEL, headless: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (NOT_FOUND.test(message)) {
      throw new Error(`Google Chrome (channel "${CHANNEL}") was not found. Install Chrome from https://www.google.com/chrome/ and try again.`, { cause: e });
    }
    throw e;
  }
}

export async function withChrome<T>(run: (session: ChromeSession) => Promise<T>): Promise<T> {
  const browser = await launch();
  try {
    const probe = await browser.newPage();
    const userAgent = (await probe.evaluate(() => navigator.userAgent)).replace("HeadlessChrome", "Chrome");
    await probe.close();
    return await run({ browser, userAgent });
  } finally {
    await browser.close();
  }
}

export const newContext = (session: ChromeSession): Promise<BrowserContext> =>
  session.browser.newContext({ userAgent: session.userAgent, locale: "en-US" });

export async function loadBundle(page: Page, name: string): Promise<void> {
  await page.evaluate(await bundle(name));
}

export interface IsolatedWorld {
  evaluate: <T>(expression: string) => Promise<T>;
}

/**
 * Runs a bundle in an isolated world of the page, like a content script: it shares the DOM but not the page's JavaScript
 * globals, so a page that patches `Element.prototype` or `fetch` cannot change the result.
 */
export async function isolatedWorld(context: BrowserContext, page: Page, bundleName: string): Promise<IsolatedWorld> {
  const cdp = await context.newCDPSession(page);
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const { executionContextId } = await cdp.send("Page.createIsolatedWorld", { frameId: frameTree.frame.id, worldName: "unrendered", grantUniveralAccess: true });
  const evaluate = async <T>(expression: string): Promise<T> => {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", { expression, contextId: executionContextId, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value as T;
  };
  await evaluate(await bundle(bundleName));
  return { evaluate };
}

export interface CorePage {
  analyze: (...args: Parameters<Core["analyze"]>) => Promise<ReturnType<Core["analyze"]>>;
  botReport: (...args: Parameters<Core["botReport"]>) => Promise<ReturnType<Core["botReport"]>>;
}

/** A blank page that hosts the extension's own analysis code, since that code needs a browser DOM. */
export async function openCore(context: BrowserContext): Promise<CorePage> {
  const page = await context.newPage();
  await loadBundle(page, "page-core.js");
  return {
    analyze: (snapshot, tokens) =>
      page.evaluate(([name, s, t]) => (Reflect.get(globalThis, name) as Core).analyze(s, t), [CORE_FN, snapshot, tokens] as const),
    botReport: (reply, url) =>
      page.evaluate(([name, r, u]) => (Reflect.get(globalThis, name) as Core).botReport(r, u), [CORE_FN, reply, url] as const),
  };
}
