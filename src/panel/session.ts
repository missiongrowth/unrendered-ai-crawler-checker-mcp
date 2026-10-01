import { analyze, type Report } from "../core/analyze";
import { BOTS } from "../data/bots";
import { CONTENT_PORT, type AnalyseMessage, type ContentReply, type ContentRequest, type Snapshot } from "../messages";

export type Phase =
  | { status: "idle" }
  | { status: "loading"; step: string }
  | { status: "analysed"; tabId: number; snapshot: Snapshot; report: Report }
  | { status: "no-access" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

type Outcome = Exclude<Phase, { status: "idle" | "loading" }>;

const CRAWLER_TOKENS = BOTS.map((b) => b.token);

let port: chrome.runtime.Port | null = null;
let generation = 0;

export function disconnectContent(): void {
  port?.disconnect();
  port = null;
}

export function postContent(request: ContentRequest): void {
  port?.postMessage(request);
}

export function isAnalyseMessage(m: unknown): m is AnalyseMessage {
  return typeof m === "object" && m !== null && "type" in m && m.type === "analyse" && "tabId" in m && typeof m.tabId === "number";
}

function requestSnapshot(tabId: number): Promise<ContentReply> {
  return new Promise((resolve, reject) => {
    const p = chrome.tabs.connect(tabId, { name: CONTENT_PORT });
    port = p;
    p.onMessage.addListener((m: ContentReply) => {
      resolve(m);
    });
    p.onDisconnect.addListener(() => {
      if (port === p) port = null;
      reject(new Error("The page closed the connection before the snapshot was ready."));
    });
    const request: ContentRequest = { type: "snapshot", crawlerTokens: CRAWLER_TOKENS };
    p.postMessage(request);
  });
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Resolves to null when a newer analysis started meanwhile. */
export async function analyseTab(tabId: number, onStep: (step: string) => void): Promise<Outcome | null> {
  const mine = ++generation;
  const superseded = () => mine !== generation;
  disconnectContent();
  try {
    const tab = await chrome.tabs.get(tabId);
    if (superseded()) return null;
    if (tab.url === undefined) return { status: "no-access" };
    const { protocol } = new URL(tab.url);
    if (protocol !== "http:" && protocol !== "https:") {
      return { status: "unsupported" };
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch {
      return superseded() ? null : { status: "no-access" };
    }
    if (superseded()) return null;
    const reply = await requestSnapshot(tabId);
    if (superseded()) return null;
    if (reply.type === "snapshot-error") return { status: "error", message: reply.error };
    onStep("Comparing raw and rendered HTML…");
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    const report = analyze(reply.snapshot, CRAWLER_TOKENS);
    return superseded() ? null : { status: "analysed", tabId, snapshot: reply.snapshot, report };
  } catch (e) {
    return superseded() ? null : { status: "error", message: messageOf(e) };
  }
}
