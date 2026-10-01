import { fetchRaw } from "../../src/fetch-raw";
import { detectChallenge } from "../../src/core/challenge";
import type { RobotsFetch } from "../../src/core/robots";
import type { ProbeAgent, ProbeReply, RawResponse } from "../../src/messages";

type ProbeResult = Extract<ProbeReply, { type: "probe-result" }>;

const REQUEST_TIMEOUT_MS = 30_000;
const LANGUAGE = "en-US,en;q=0.9";

async function fetchRobots(pageUrl: string, userAgent: string): Promise<RobotsFetch> {
  try {
    const res = await fetch(new URL("/robots.txt", pageUrl).href, {
      credentials: "omit",
      cache: "no-store",
      headers: { "user-agent": userAgent, "accept-language": LANGUAGE },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const challenge = detectChallenge(res.headers);
    if (challenge !== null) return { challenge, status: res.status };
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const fetchAs = (url: string, userAgent: string, characterSet: string): Promise<RawResponse> =>
  fetchRaw(url, "omit", characterSet, {
    headers: { "user-agent": userAgent, "accept-language": LANGUAGE },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) [out[i], out[j]] = [b, a];
  }
  return out;
}

/** The background worker's sequence: robots.txt, a control, each bot in random order, a second control. Controls use the browser's user-agent. */
export async function runProbe(url: string, characterSet: string, agents: readonly ProbeAgent[], browserUserAgent: string): Promise<ProbeResult> {
  const robots = await fetchRobots(url, browserUserAgent);
  const controlA = await fetchAs(url, browserUserAgent, characterSet);
  const responses = new Map<string, RawResponse>();
  for (const agent of shuffled(agents)) responses.set(agent.token, await fetchAs(url, agent.userAgent, characterSet));
  const controlB = await fetchAs(url, browserUserAgent, characterSet);
  return {
    type: "probe-result",
    robots,
    controls: [controlA, controlB],
    agents: agents.map((a) => ({ token: a.token, response: responses.get(a.token) ?? { ok: false, error: "Not probed." } })),
  };
}
