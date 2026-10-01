import { PROBE_PORT } from "./messages";
import type { AnalyseMessage, ProbeAgent, ProbeReply, ProbeRequest, RawResponse } from "./messages";
import { fetchRaw } from "./fetch-raw";
import type { RobotsFetch } from "./core/robots";

const RULE_ID = 1;
const CLIENT_HINTS = ["sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform"];

const clearRule = () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [RULE_ID] });

// A crashed run can leave the session rule behind; the service worker starts here again.
void clearRule();

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined) return;
  const tabId = tab.id;
  // Must be the first call: the activeTab grant depends on the user gesture still being live.
  void chrome.sidePanel.open({ tabId });
  const message: AnalyseMessage = { type: "analyse", tabId };
  // Rejects when no panel is listening yet; the panel analyses on load anyway.
  chrome.runtime.sendMessage(message).catch(() => undefined);
});

async function fetchRobots(pageUrl: string): Promise<RobotsFetch> {
  try {
    const res = await fetch(new URL("/robots.txt", pageUrl).href, { credentials: "omit", cache: "no-store" });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function fetchAs(agent: ProbeAgent, req: ProbeRequest): Promise<RawResponse> {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [RULE_ID],
    addRules: [
      {
        id: RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [
            { header: "user-agent", operation: chrome.declarativeNetRequest.HeaderOperation.SET, value: agent.userAgent },
            ...CLIENT_HINTS.map((header) => ({ header, operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE })),
          ],
        },
        condition: {
          requestDomains: req.hosts,
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          tabIds: [chrome.tabs.TAB_ID_NONE],
        },
      },
    ],
  });
  try {
    return await fetchRaw(req.url, "omit", req.characterSet);
  } finally {
    await clearRule();
  }
}

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

/** Runs the sequence; resolves null when the panel went away, after the current request finished. */
async function runProbe(req: ProbeRequest, isOpen: () => boolean): Promise<ProbeReply | null> {
  const robots = await fetchRobots(req.url);
  if (!isOpen()) return null;
  const controlA = await fetchRaw(req.url, "omit", req.characterSet);
  const responses = new Map<string, RawResponse>();
  for (const agent of shuffled(req.agents)) {
    if (!isOpen()) return null;
    responses.set(agent.token, await fetchAs(agent, req));
  }
  if (!isOpen()) return null;
  const controlB = await fetchRaw(req.url, "omit", req.characterSet);
  return {
    type: "probe-result",
    robots,
    controls: [controlA, controlB],
    agents: req.agents.map((a) => ({ token: a.token, response: responses.get(a.token) ?? { ok: false, error: "Not probed." } })),
  };
}

async function handleProbe(port: chrome.runtime.Port, req: ProbeRequest, isOpen: () => boolean): Promise<void> {
  let reply: ProbeReply | null;
  try {
    reply = await runProbe(req, isOpen);
  } catch (e) {
    reply = { type: "probe-error", error: e instanceof Error ? e.message : String(e) };
  } finally {
    await clearRule().catch(() => undefined);
  }
  if (reply === null || !isOpen()) return;
  try {
    port.postMessage(reply);
  } catch {
    // The panel disconnected between the check and the post.
  }
}

const isProbeRequest = (m: unknown): m is ProbeRequest =>
  typeof m === "object" && m !== null && (m as { type?: unknown }).type === "probe";

// One probe at a time: the rule is a single shared slot.
let queue: Promise<void> = Promise.resolve();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PROBE_PORT) return;
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
  });
  port.onMessage.addListener((message: unknown) => {
    if (!isProbeRequest(message)) return;
    queue = queue.then(() => handleProbe(port, message, () => open));
  });
});
