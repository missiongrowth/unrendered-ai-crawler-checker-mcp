import { botReport, type BotReport } from "../core/botcheck";
import { BOTS } from "../data/bots";
import { PROBE_PORT, type ProbeAgent, type ProbeReply, type ProbeRequest, type Snapshot } from "../messages";

export type BotRun =
  | { status: "idle" }
  | { status: "running" }
  | { status: "denied"; host: string }
  | { status: "done"; report: BotReport }
  | { status: "error"; message: string };

type ProbeResult = Extract<ProbeReply, { type: "probe-result" }>;

/** Host permission patterns ignore the port, so only hostnames are used; an IP or a dotless host has no www./apex twin. */
export function originsFor(url: string): { origins: string[]; hosts: string[] } {
  const { protocol, hostname } = new URL(url);
  const hasTwin = hostname.includes(".") && !hostname.includes(":") && !/^[\d.]+$/.test(hostname);
  const twin = !hasTwin ? null : hostname.startsWith("www.") ? hostname.slice(4) : `www.${hostname}`;
  const hosts = twin === null ? [hostname] : [hostname, twin];
  return { origins: hosts.map((h) => `${protocol}//${h}/*`), hosts };
}

export const probedAgents = (): ProbeAgent[] => BOTS.flatMap((b) => (b.userAgent === null ? [] : [{ token: b.token, userAgent: b.userAgent }]));

function probe(request: ProbeRequest): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const p = chrome.runtime.connect({ name: PROBE_PORT });
    p.onMessage.addListener((m: ProbeReply) => {
      if (m.type === "probe-error") reject(new Error(m.error));
      else resolve(m);
      p.disconnect();
    });
    p.onDisconnect.addListener(() => {
      reject(new Error("The background worker closed the connection before the bot check finished."));
    });
    p.postMessage(request);
  });
}

export class AccessDenied extends Error {
  readonly host: string;
  constructor(host: string) {
    super(`Access to ${host} was not allowed.`);
    this.host = host;
  }
}

/** Must be called synchronously from the click handler: the permission request needs the user gesture. */
export async function runBotCheck(snapshot: Snapshot): Promise<BotReport> {
  const { origins, hosts } = originsFor(snapshot.url);
  const granted = await chrome.permissions.request({ origins });
  if (!granted) throw new AccessDenied(new URL(snapshot.url).host);
  const agents = probedAgents();
  const reply = await probe({ type: "probe", url: snapshot.url, hosts, agents, characterSet: snapshot.characterSet });
  return botReport(reply, snapshot.url);
}
