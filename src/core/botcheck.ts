import { BOTS } from "../data/bots";
import type { Bot } from "../data/bots";
import type { ProbeReply, RawResponse } from "../messages";
import { detectChallenge } from "./challenge";
import type { Challenge } from "./challenge";
import { readFields } from "./fields";
import { tokenize } from "./normalize";
import { contentSignals, robotsVerdict } from "./robots";
import type { ContentSignal, RobotsFetch, RobotsVerdict } from "./robots";
import { segment } from "./segment";
import { isNoindex, parseRobotsDirectives } from "./xrobots";

export type ProbeVerdict =
  | { kind: "error"; detail: string }
  | { kind: "challenged"; challenge: Challenge; status: number }
  | { kind: "rate-limited"; status: 429 }
  | { kind: "blocked"; status: number }
  | { kind: "redirected-elsewhere"; finalUrl: string }
  | { kind: "different"; similarity: number }
  | { kind: "same"; similarity: number };

export interface BotRow {
  bot: Bot;
  robots: RobotsVerdict;
  probe: null | {
    verdict: ProbeVerdict;
    noindex: boolean;
  };
}

export interface BotReport {
  robots: RobotsFetch;
  contentSignals: ContentSignal[];
  controlSimilarity: number | null;
  rows: BotRow[];
}

type Ok = Extract<RawResponse, { ok: true }>;

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * Verdict order: challenge, 429, other non-2xx, redirect away from the control's
 * final URL, then similarity. `similarities` is lazy so the HTML is only parsed
 * for responses that reach that step. With both controls, "same" means the bot's
 * response is at least as close to a control as the controls are to each other;
 * with one control only an identical token set counts.
 */
export function classify(
  res: Ok,
  controlUrl: string | null,
  similarities: () => number[],
  controlSimilarity: number | null,
): ProbeVerdict {
  const challenge = detectChallenge(new Headers(res.headers));
  if (challenge !== null) return { kind: "challenged", challenge, status: res.status };
  if (res.status === 429) return { kind: "rate-limited", status: 429 };
  if (res.status < 200 || res.status > 299) return { kind: "blocked", status: res.status };
  if (controlUrl !== null && res.url !== controlUrl) return { kind: "redirected-elsewhere", finalUrl: res.url };
  const sims = similarities();
  if (sims.length === 0) return { kind: "error", detail: "Both control requests failed, so there is nothing to compare with." };
  const similarity = Math.max(...sims);
  const same = controlSimilarity === null ? similarity === 1 : similarity >= controlSimilarity;
  return { kind: same ? "same" : "different", similarity };
}

function parseHtml(html: string): Document {
  return Document.parseHTMLUnsafe(html);
}

function pageTokens(doc: Document): Set<string> {
  const out = new Set<string>();
  for (const s of segment(doc.body, { shadowRootOf: (el) => el.shadowRoot, includeNoscript: true })) {
    for (const t of tokenize(s.text)) out.add(t);
  }
  return out;
}

function noindexFor(res: Ok, doc: Document, token: string): boolean {
  const header = res.headers["x-robots-tag"];
  if (header !== undefined && isNoindex(parseRobotsDirectives([header]), token)) return true;
  const meta = readFields(doc, res.url, [token]).robotsMeta;
  return [meta["robots"], meta[token.toLowerCase()]].some(
    (values) => values !== undefined && isNoindex(parseRobotsDirectives(values), token),
  );
}

export function botReport(reply: Extract<ProbeReply, { type: "probe-result" }>, pageUrl: string): BotReport {
  const [a, b] = reply.controls;
  const docs = new Map<Ok, Document>();
  const docOf = (res: Ok): Document => {
    let doc = docs.get(res);
    if (doc === undefined) docs.set(res, (doc = parseHtml(res.html)));
    return doc;
  };
  const controls = [a, b].filter((c): c is Ok => c.ok);
  const controlTokens = new Map(controls.map((c) => [c, pageTokens(docOf(c))]));
  const controlSimilarity = a.ok && b.ok ? jaccard(controlTokens.get(a) ?? new Set(), controlTokens.get(b) ?? new Set()) : null;
  const controlUrl = a.ok ? a.url : null;

  const rows = BOTS.map((bot): BotRow => {
    const robots = robotsVerdict(reply.robots, bot.token, pageUrl);
    if (bot.userAgent === null) return { bot, robots, probe: null };
    const res = reply.agents.find((x) => x.token === bot.token)?.response;
    if (res === undefined) return { bot, robots, probe: { verdict: { kind: "error", detail: "No response recorded." }, noindex: false } };
    if (!res.ok) return { bot, robots, probe: { verdict: { kind: "error", detail: res.error }, noindex: false } };
    const verdict = classify(
      res,
      controlUrl,
      () => {
        const tokens = pageTokens(docOf(res));
        return controls.map((c) => jaccard(tokens, controlTokens.get(c) ?? new Set()));
      },
      controlSimilarity,
    );
    return { bot, robots, probe: { verdict, noindex: noindexFor(res, docOf(res), bot.token) } };
  });

  const { robots } = reply;
  return {
    robots,
    contentSignals: "status" in robots && robots.status >= 200 && robots.status <= 299 ? contentSignals(robots.body) : [],
    controlSimilarity,
    rows,
  };
}
