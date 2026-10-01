import { BOTS } from "../../src/data/bots";
import type { Report } from "../../src/core/analyze";
import type { Snapshot } from "../../src/messages";
import { isolatedWorld, newContext, openCore, withChrome } from "./browser";
import { SNAPSHOT_FN } from "./globals";

const NAVIGATION_TIMEOUT_MS = 30_000;
const LOAD_TIMEOUT_MS = 15_000;
const CRAWLER_TOKENS = BOTS.map((b) => b.token);

export type Analysis = { ok: true; snapshot: Snapshot; report: Report } | { ok: false; error: string };

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** The extension's flow: load the page, take the snapshot in it, run `analyze` on the result. */
export function analyzeUrl(url: string): Promise<Analysis> {
  return withChrome(async (session) => {
    const context = await newContext(session);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
    } catch (e) {
      return { ok: false, error: `Could not load ${url}: ${messageOf(e)}` };
    }
    // Pages that never finish loading are analysed as they stand; the snapshot reports `settled: false`.
    await page.waitForLoadState("load", { timeout: LOAD_TIMEOUT_MS }).catch(() => undefined);
    const world = await isolatedWorld(context, page, "page-snapshot.js");
    const snapshot = await world.evaluate<Snapshot>(`${SNAPSHOT_FN}(${JSON.stringify(CRAWLER_TOKENS)})`);
    const core = await openCore(context);
    return { ok: true, snapshot, report: await core.analyze(snapshot, CRAWLER_TOKENS) };
  });
}
