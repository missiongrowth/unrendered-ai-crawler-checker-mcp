import { STATES } from "../../states";
import type { Snapshot } from "../../messages";
import { FIELD_LABEL, STAT_LABELS, HERO_SUB, wordsLine, wordsOf } from "../copy";
import { notices, percentText, stateCounts, STATE_ORDER, wordsOnlyAfterJs, type OkReport } from "../metrics";

const cell = (s: string): string => s.replace(/\s+/g, " ").trim();

export const summaryLine = (report: OkReport): string => {
  const n = wordsOnlyAfterJs(report);
  return `${report.url}: ${percentText(report.main)} of the main content is in the raw HTML. ${String(n)} words appear only in the rendered HTML.`;
};

export function markdownReport(report: OkReport, snapshot: Snapshot, product: string): string {
  const counts = stateCounts(report.blocks);
  const stats = [
    [STAT_LABELS.main, report.main],
    [STAT_LABELS.all, report.all],
    [STAT_LABELS.hidden, report.hidden],
  ] as const;
  const lines = [
    "# Raw HTML vs rendered HTML",
    "",
    report.url,
    "",
    `**${percentText(report.main)}** ${HERO_SUB}`,
    "",
    wordsLine(wordsOnlyAfterJs(report)),
    "",
    ...stats.map(([name, c]) => `- ${name}: ${percentText(c)}${c.total === 0 ? "" : ` (${wordsOf(c.credited, c.total)})`}`),
    "",
    "## Text blocks",
    "",
    ...STATE_ORDER.map((s) => `- ${STATES[s].label}: ${String(counts[s])}`),
  ];
  const changed = report.fields.filter((f) => f.state !== "same" && f.state !== "absent");
  if (changed.length > 0) {
    lines.push("", "## Head and structured data", "");
    for (const f of changed) lines.push(`- ${cell(f.field)}: ${FIELD_LABEL[f.state]}`);
  }
  if (report.jsOnlyLinks.length > 0) lines.push("", `Links only in rendered HTML (${String(report.jsOnlyLinks.length)})`);
  const flagged = notices(report, snapshot);
  if (flagged.length > 0) lines.push("", ...flagged.map((f) => `- ${f}`));
  lines.push("", `${product} by Mission Growth (https://missiongrowth.io)`, "");
  return lines.join("\n");
}
