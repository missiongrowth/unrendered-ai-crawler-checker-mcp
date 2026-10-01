import type { BotReport } from "../../src/core/botcheck";
import type { ClassifiedBlock, FieldDiff, Report } from "../../src/core/analyze";
import type { Snapshot } from "../../src/messages";
import { differs, percent, renderGroups, stateCounts, topMissing } from "../../src/panel/metrics";

const MISSING_BLOCKS = 15;
const FIELD_ROWS = 30;
const LIST_ITEMS = 8;
const TEXT_CHARS = 220;

export const ANALYZE_NOT_CHECKED = [
  "Closed shadow roots: the extension reads them, this server cannot, so their text counts as absent from the rendered side.",
  "Anything that needs interaction: no scrolling, clicks, logins, cookie-consent choices or other viewport sizes; only what the page loads by itself on a 1280x720 desktop viewport.",
  "Text inside iframes (the count is reported, the content is not compared).",
  "Which pages and bots a real crawler is allowed to fetch: use check_ai_bots for robots.txt rules and what each bot's user-agent receives.",
  "Bot protection that keys on IP address or TLS fingerprint: the raw HTML is fetched by this machine's Chrome, which a WAF may serve differently than a real crawler.",
  "Other pages of the site; only this URL was analysed.",
  "Crawlers that do run JavaScript (for example Googlebot's renderer); the numbers describe crawlers that read the raw HTML only.",
];

export const BOTS_NOT_CHECKED = [
  "Whether a request really comes from the bot's published IP ranges: sites that verify by IP can answer a real crawler differently from this machine.",
  "Bots whose http field is not_probed get only their robots.txt rule checked, no HTTP request: bots with no verified user-agent string yet, Googlebot and Applebot (the extension does not imitate them), and control tokens such as Google-Extended that never fetch pages.",
  "Rate limits and behaviour under repeated or concurrent crawling.",
  "Pages other than this URL: robots.txt rules are evaluated for this URL only.",
  "Page text: the HTTP answer is compared as a token-set similarity to two control fetches, not read in full; use analyze_page for content coverage.",
];

const clip = (s: string, n = TEXT_CHARS): string => (s.length > n ? `${s.slice(0, n)}...` : s);

const missingBlock = (b: ClassifiedBlock) => ({ words: b.tokens, region: b.region, tag: b.tag, text: clip(b.text) });

const fieldRow = (d: FieldDiff) => ({
  field: d.field,
  state: d.state,
  server: d.server.slice(0, 5).map((v) => clip(v, 120)),
  rendered: d.rendered.slice(0, 5).map((v) => clip(v, 120)),
});

const coverage = (c: { credited: number; total: number }) => ({ percent: percent(c), words_in_raw_html: c.credited, words_total: c.total });

function gateOf(report: Extract<Report, { ok: false }>) {
  const { gate } = report;
  switch (gate.kind) {
    case "fetch-failed":
      return { kind: gate.kind, detail: gate.detail };
    case "http-status":
      return { kind: gate.kind, status: gate.status };
    case "challenge":
      return { kind: gate.kind, vendor: gate.challenge.vendor, header: gate.challenge.header, status: gate.status };
    case "different-url":
      return { kind: gate.kind, final_url: gate.finalUrl };
  }
}

export function summarizeAnalysis(requestedUrl: string, snapshot: Snapshot, report: Report) {
  if (!report.ok) {
    return {
      url: requestedUrl,
      comparison: "not_possible",
      reason: "The raw HTML request did not return this page, so no coverage is computed.",
      gate: gateOf(report),
      not_checked: ANALYZE_NOT_CHECKED,
    };
  }
  const groups = renderGroups(report);
  const words = (id: string) => groups.find((g) => g.id === id)?.words ?? 0;
  const changed = report.fields.filter(differs);
  return {
    url: requestedUrl,
    final_url: report.url,
    raw_http_status: report.status,
    coverage: {
      main_content: { ...coverage(report.main), basis: report.mainBasis },
      all_visible_text: coverage(report.all),
      hidden_text: coverage(report.hidden),
    },
    main_content_words: {
      in_raw_html: words("raw"),
      only_in_json_ld_or_hydration_data: words("data"),
      only_after_javascript: words("rendered"),
    },
    block_states: stateCounts(report.blocks),
    missing_from_raw_html: topMissing(report, MISSING_BLOCKS).map(missingBlock),
    fields: {
      changed_count: changed.length,
      rows: changed.slice(0, FIELD_ROWS).map(fieldRow),
      truncated: changed.length > FIELD_ROWS,
    },
    links_only_after_javascript: { count: report.jsOnlyLinks.length, examples: report.jsOnlyLinks.slice(0, LIST_ITEMS) },
    text_in_raw_html_removed_by_javascript: { count: report.removed.length, examples: report.removed.slice(0, 3).map((t) => clip(t, 120)) },
    unparsed_data_scripts: report.unparsedDataScripts,
    notes: {
      settled: snapshot.settled,
      settle_ms: snapshot.settleMs,
      translated_by_browser: snapshot.translated,
      iframes_not_compared: snapshot.iframes,
      raw_html_has_more_text_with_cookies_points: report.cookieLift === null ? null : Math.round(report.cookieLift * 100),
    },
    not_checked: ANALYZE_NOT_CHECKED,
  };
}

export function summarizeBots(url: string, report: BotReport) {
  const { robots } = report;
  const rows = report.rows.map((r) => {
    const v = r.probe?.verdict;
    return {
      bot: r.bot.token,
      vendor: r.bot.vendor,
      class: r.bot.class,
      robots_txt: { allowed: r.robots.allowed, reason: r.robots.reason, matched_rule: r.robots.lineText, line: r.robots.line },
      http:
        v === undefined
          ? "not_probed"
          : {
              result: v.kind,
              ...("status" in v && { status: v.status }),
              ...("finalUrl" in v && { final_url: v.finalUrl }),
              ...("similarity" in v && { similarity: Math.round(v.similarity * 1000) / 1000 }),
              ...("detail" in v && { detail: v.detail }),
              ...("challenge" in v && { challenge: v.challenge.vendor }),
              noindex: r.probe?.noindex ?? false,
            },
      renders_js: r.bot.rendersJs,
    };
  });
  return {
    url,
    robots_txt: {
      status: "status" in robots ? robots.status : null,
      ...("challenge" in robots && { challenge: robots.challenge.vendor }),
      ...("error" in robots && { error: robots.error }),
      content_signals: report.contentSignals,
    },
    control_similarity: report.controlSimilarity === null ? null : Math.round(report.controlSimilarity * 1000) / 1000,
    summary: {
      disallowed_by_robots_txt: rows.filter((r) => r.robots_txt.allowed === false).map((r) => r.bot),
      http_not_same_page: rows.filter((r) => typeof r.http === "object" && r.http.result !== "same").map((r) => `${r.bot}: ${typeof r.http === "object" ? r.http.result : ""}`),
    },
    bots: rows,
    not_checked: BOTS_NOT_CHECKED,
  };
}
