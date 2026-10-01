import { RENDER_STUDY } from "../../data/bots";
import { STATES } from "../../states";
import { flags, mainBasisText, percentText, stateCounts, STATE_ORDER, topMissing, wordsOnlyAfterJs, type OkReport } from "../metrics";
import type { Snapshot } from "../../messages";

const cell = (s: string): string => s.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s);

export const summaryLine = (report: OkReport): string =>
  `${report.url}: ${percentText(report.main)} of the main content is in the server HTML, ${wordsOnlyAfterJs(report)} words only appear after JavaScript.`;

export function markdownReport(report: OkReport, snapshot: Snapshot, product: string, version: string): string {
  const counts = stateCounts(report.blocks);
  const rows = [
    ["Main content", report.main, mainBasisText(report)],
    ["All visible text", report.all, "outside dialogs"],
    ["Hidden text", report.hidden, "rendered but not displayed"],
  ] as const;
  const lines = [
    "# Server HTML vs rendered page",
    "",
    `URL: ${report.url}`,
    `Analysed: ${new Date().toISOString().slice(0, 10)} (server response HTTP ${report.status}, request without cookies)`,
    "",
    `**${percentText(report.main)} of the main content is in the server HTML · ${wordsOnlyAfterJs(report)} words only appear after JavaScript**`,
    "",
    "| Scope | Words in server HTML | Total words | Share | Basis |",
    "| --- | ---: | ---: | ---: | --- |",
    ...rows.map(([name, c, basis]) => `| ${name} | ${c.credited} | ${c.total} | ${percentText(c)} | ${basis} |`),
    "",
    "## Blocks by state",
    "",
    ...STATE_ORDER.map((s) => `- ${STATES[s].label}: ${counts[s]}`),
  ];
  const missing = topMissing(report, 10);
  if (missing.length > 0) lines.push("", "## Largest blocks added by JavaScript", "", ...missing.map((b) => `- (${b.tokens} words) ${clip(cell(b.text), 200)}`));
  const changed = report.fields.filter((f) => f.state !== "same" && f.state !== "absent");
  if (changed.length > 0) {
    lines.push("", "## Fields that differ", "", "| Field | State | Server HTML | Rendered |", "| --- | --- | --- | --- |");
    for (const f of changed) lines.push(`| ${cell(f.field)} | ${f.state} | ${cell(clip(f.server.join("; "), 120))} | ${cell(clip(f.rendered.join("; "), 120))} |`);
  }
  if (report.jsOnlyLinks.length > 0) lines.push("", `Links only in the rendered page: ${report.jsOnlyLinks.length}`);
  lines.push("", "## Notes", "", ...flags(report, snapshot).map((f) => `- ${f}`));
  lines.push(`- Third-party basis: ${RENDER_STUDY.publisher}, "${RENDER_STUDY.title}" (${RENDER_STUDY.date}), ${RENDER_STUDY.url}`);
  lines.push("", `Made with ${product} ${version} by MissionGrowth (https://missiongrowth.io)`, "");
  return lines.join("\n");
}
