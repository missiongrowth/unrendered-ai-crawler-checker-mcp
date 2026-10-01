import { CONFIG } from "../config";
import type { BlockState } from "../core/align";
import type { ClassifiedBlock, Coverage, FieldDiff, Report } from "../core/analyze";
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

/** Main-content words that are neither credited to the raw HTML nor found in its data; the "Only in rendered HTML" bar segment. */
export function wordsOnlyAfterJs(report: OkReport): number {
  return renderGroups(report).find((g) => g.id === "rendered")?.words ?? 0;
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

export type GroupId = "raw" | "data" | "rendered";

export interface RenderGroup {
  id: GroupId;
  /** State whose colour and pattern the group borrows. */
  state: BlockState;
  words: number;
  percent: number;
}

const GROUP_STATE: Record<GroupId, BlockState> = { raw: "server", data: "structured-data", rendered: "js-added" };

/** Same selection as `report.main` in analyze(): visible non-dialog blocks of the main landmark, or of no landmark. */
export function mainBlocks(report: OkReport): ClassifiedBlock[] {
  const visible = report.blocks.filter(isCounted);
  const region = report.mainBasis === "main-landmark" ? "main" : "other";
  return visible.filter((b) => b.region === region);
}

/**
 * Main-content words in three groups that add up to `report.main`: credited words
 * (the hero percentage, rounded the same way), words found only in JSON-LD or
 * hydration data, and the rest, which only the rendered HTML has.
 */
export function renderGroups(report: OkReport): RenderGroup[] {
  let data = 0;
  for (const b of mainBlocks(report)) if (b.state === "structured-data" || b.state === "hydration-data") data += b.tokens;
  const { credited, total } = report.main;
  const rendered = total - credited - data;
  const rawPercent = percent(report.main) ?? 0;
  const dataPercent = total === 0 ? 0 : Math.round((data / total) * 100);
  return [
    { id: "raw", state: GROUP_STATE.raw, words: credited, percent: rawPercent },
    { id: "data", state: GROUP_STATE.data, words: data, percent: dataPercent },
    { id: "rendered", state: GROUP_STATE.rendered, words: rendered, percent: rendered === 0 ? 0 : 100 - rawPercent - dataPercent },
  ];
}

export const heroText = (c: Coverage): string => {
  const p = percent(c);
  return p === null ? "No text" : `${p}%`;
};

const plural = (n: number, one: string, many: string): string => `${String(n)} ${n === 1 ? one : many}`;

/** Only the notices that are true for this page. */
export function notices(report: OkReport, snapshot: Snapshot): string[] {
  const out: string[] = [];
  const seconds = (snapshot.settleMs / 1000).toFixed(1);
  if (report.cookieLift !== null) {
    out.push(`The raw HTML has more text when your cookies are sent (+${String(Math.round(report.cookieLift * 100))} points). Crawlers send no cookies, so the numbers above use none.`);
  }
  if (!snapshot.settled) out.push(`The page was still changing after ${seconds} s. The snapshot is from that moment.`);
  if (snapshot.translated) out.push("Chrome is translating this page, so rendered text may not match the raw HTML. Turn translation off and analyse again.");
  if (snapshot.iframes > 0) out.push(`${plural(snapshot.iframes, "iframe on this page is", "iframes on this page are")} not included.`);
  if (report.unparsedDataScripts > 0) {
    out.push(`${plural(report.unparsedDataScripts, "data script", "data scripts")} could not be read, so text in them was not checked.`);
  }
  const { first } = snapshot.raw;
  if (first.ok && first.truncated) {
    const mb = String(CONFIG.rawMaxBytes / (1024 * 1024));
    out.push(`The raw HTML is larger than ${mb} MB. Only the first ${mb} MB were compared.`);
  }
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

/** Fields that are neither the same nor absent in both versions. */
export const differs = (f: FieldDiff): boolean => f.state !== "same" && f.state !== "absent";

export const differsCount = (report: OkReport): number => report.fields.filter(differs).length;
