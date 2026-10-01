import { CONFIG } from "../config";
import type { BlockState } from "../core/align";
import type { ClassifiedBlock, Coverage, Report } from "../core/analyze";
import type { Snapshot } from "../messages";

export type OkReport = Extract<Report, { ok: true }>;

export const STATE_ORDER: readonly BlockState[] = ["server", "partial", "ambiguous", "volatile", "structured-data", "hydration-data", "js-added"];

/** Rounded down so that 100% is shown only when every word is credited. */
export const percent = (c: Coverage): number | null => (c.total === 0 ? null : Math.floor((c.credited / c.total) * 100));

export const percentText = (c: Coverage): string => {
  const p = percent(c);
  return p === null ? "n/a" : `${p}%`;
};

export const isCounted = (b: ClassifiedBlock): boolean => !b.hidden && b.region !== "dialog";

/** Words of js-added blocks plus the uncredited words of partial blocks, in visible non-dialog blocks. */
export function wordsOnlyAfterJs(report: OkReport): number {
  let words = 0;
  for (const b of report.blocks) {
    if (!isCounted(b)) continue;
    if (b.state === "js-added") words += b.tokens;
    else if (b.state === "partial") words += b.tokens - b.credited;
  }
  return words;
}

export function topMissing(report: OkReport, limit: number): ClassifiedBlock[] {
  return report.blocks
    .filter((b) => isCounted(b) && b.state === "js-added")
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, limit);
}

export function stateCounts(blocks: readonly ClassifiedBlock[]): Record<BlockState, number> {
  const counts: Record<BlockState, number> = { server: 0, partial: 0, ambiguous: 0, volatile: 0, "structured-data": 0, "hydration-data": 0, "js-added": 0 };
  for (const b of blocks) counts[b.state] += 1;
  return counts;
}

export const mainBasisText = (report: OkReport): string =>
  report.mainBasis === "main-landmark" ? "the page's main landmark" : "text outside header, nav, aside, footer and dialogs";

export function flags(report: OkReport, snapshot: Snapshot): string[] {
  const out: string[] = [];
  const seconds = (snapshot.settleMs / 1000).toFixed(1);
  if (!snapshot.settled) out.push(`The page was still changing after ${seconds} s; the snapshot was taken at that point.`);
  if (snapshot.translated) out.push("Chrome Translate is active, so the rendered text may be translated and differ from the server HTML.");
  if (snapshot.iframes > 0) out.push(`${snapshot.iframes} iframe${snapshot.iframes === 1 ? " was" : "s were"} not analysed.`);
  out.push(`Measured at a viewport width of ${snapshot.viewportWidth} px. The side panel narrows the page, so the hidden flag can differ at full width; the server HTML states do not depend on layout.`);
  if (report.cookieLift !== null) {
    out.push(`The server HTML contains more of the page when your cookies are sent (all-text coverage +${Math.round(report.cookieLift * 100)} points). The numbers here come from a request without cookies.`);
  }
  if (report.unparsedDataScripts > 0) {
    out.push(`${report.unparsedDataScripts} data script${report.unparsedDataScripts === 1 ? "" : "s"} could not be parsed, so text inside them is not counted as structured or hydration data.`);
  }
  const { first } = snapshot.raw;
  if (first.ok && first.truncated) out.push(`The server response was larger than ${CONFIG.rawMaxBytes / (1024 * 1024)} MB and was truncated before comparison.`);
  return out;
}

export const stripHash = (url: string): string => {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
};
