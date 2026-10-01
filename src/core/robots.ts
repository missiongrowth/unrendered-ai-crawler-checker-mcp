import { RobotsMatcher, RobotsParseHandler, parseRobotsTxt } from "google-robotstxt-parser";
import type { Challenge } from "./challenge";

export type RobotsFetch = { status: number; body: string } | { challenge: Challenge; status: number } | { error: string };

export type RobotsReason = "rules" | "no-matching-rule" | "4xx-allow-all" | "5xx-disallow-all" | "unreachable-disallow-all" | "challenged";

export type RobotsVerdict = {
  /** null: a challenge page came back instead of robots.txt, so the rules are unknown. */
  allowed: boolean | null;
  reason: RobotsReason;
  line: number | null;
  lineText: string | null;
  specificGroup: boolean;
};

export type ContentSignal = { agents: string[]; value: string; line: number };

/** RFC 9309 §2.5: parsers must handle at least 500 KiB. */
const MAX_BYTES = 500 * 1024;

function truncate(body: string): string {
  const bytes = new TextEncoder().encode(body);
  if (bytes.length <= MAX_BYTES) return body;
  return new TextDecoder().decode(bytes.subarray(0, MAX_BYTES));
}

function noRules(allowed: boolean | null, reason: RobotsReason): RobotsVerdict {
  return { allowed, reason, line: null, lineText: null, specificGroup: false };
}

function lineAt(body: string, line: number): string {
  return (body.split(/\r\n|\r|\n/)[line - 1] ?? "").trim();
}

/** RFC 9309 §2.3.1: 2xx parsed, 4xx unavailable (allow all), 5xx or network failure unreachable (disallow all). */
export function robotsVerdict(fetched: RobotsFetch, token: string, url: string): RobotsVerdict {
  if ("error" in fetched) return noRules(false, "unreachable-disallow-all");
  if ("challenge" in fetched) return noRules(null, "challenged");
  const { status } = fetched;
  if (status >= 500) return noRules(false, "5xx-disallow-all");
  if (status >= 400) return noRules(true, "4xx-allow-all");
  const body = truncate(fetched.body);
  const matcher = new RobotsMatcher();
  const allowed = matcher.oneAgentAllowedByRobots(body, token, url);
  const n = matcher.matchingLine();
  return {
    allowed,
    reason: n === 0 ? "no-matching-rule" : "rules",
    line: n === 0 ? null : n,
    lineText: n === 0 ? null : lineAt(body, n),
    specificGroup: matcher.everSeenSpecificAgent(),
  };
}

class SignalCollector extends RobotsParseHandler {
  readonly signals: ContentSignal[] = [];
  private agents: string[] = [];
  private ruleSeen = false;

  override handleUserAgent(_line: number, value: string): void {
    if (this.ruleSeen) {
      this.agents = [];
      this.ruleSeen = false;
    }
    this.agents.push(value);
  }

  override handleAllow(): void {
    this.ruleSeen = true;
  }

  override handleDisallow(): void {
    this.ruleSeen = true;
  }

  override handleUnknownAction(line: number, action: string, value: string): void {
    if (action.toLowerCase() !== "content-signal") return;
    this.signals.push({ agents: [...this.agents], value: value.trim(), line });
  }
}

/** Cloudflare Content Signals Policy lines with the user-agent group each belongs to. */
export function contentSignals(body: string): ContentSignal[] {
  const collector = new SignalCollector();
  parseRobotsTxt(truncate(body), collector);
  return collector.signals;
}
