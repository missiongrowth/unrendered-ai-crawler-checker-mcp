import type { PageFields } from "./core/fields";
import type { Region } from "./core/segment";
import type { BlockState } from "./core/align";
import type { RobotsFetch } from "./core/robots";

export interface RenderedBlock {
  id: number;
  tag: string;
  text: string;
  region: Region;
  hidden: boolean;
}

export type RawResponse =
  | {
      ok: true;
      status: number;
      url: string;
      redirected: boolean;
      headers: Record<string, string>;
      html: string;
      encoding: string;
      truncated: boolean;
    }
  | { ok: false; error: string };

export interface Snapshot {
  url: string;
  /** `document.characterSet`, the fallback when the server declares no encoding. */
  characterSet: string;
  viewportWidth: number;
  settled: boolean;
  settleMs: number;
  translated: boolean;
  iframes: number;
  blocks: RenderedBlock[];
  fields: PageFields;
  raw: { first: RawResponse; second: RawResponse; withCookies: RawResponse };
}

/** Port names. The panel opens both; closing the panel disconnects them. */
export const CONTENT_PORT = "content";
export const PROBE_PORT = "probe";

/** Panel → content script, over `chrome.tabs.connect(tabId, { name: CONTENT_PORT })`. Disconnect removes the overlay. */
export type ContentRequest =
  | { type: "snapshot"; crawlerTokens: string[] }
  | { type: "overlay"; states: Record<number, BlockState> | null }
  | { type: "reveal"; id: number };

/** Content script → panel. */
export type ContentReply = { type: "snapshot"; snapshot: Snapshot } | { type: "snapshot-error"; error: string };

export interface ProbeAgent {
  token: string;
  userAgent: string;
}

/** Panel → service worker, over `chrome.runtime.connect({ name: PROBE_PORT })`, after the origin was granted. */
export interface ProbeRequest {
  type: "probe";
  url: string;
  /** Hosts the DNR rule may rewrite (the granted origins). */
  hosts: string[];
  agents: ProbeAgent[];
  characterSet: string;
}

/** Service worker → panel. Controls use the browser's own user-agent, before and after the bots. */
export type ProbeReply =
  | {
      type: "probe-result";
      robots: RobotsFetch;
      controls: [RawResponse, RawResponse];
      agents: { token: string; response: RawResponse }[];
    }
  | { type: "probe-error"; error: string };
