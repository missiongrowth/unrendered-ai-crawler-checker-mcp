import type { PageFields } from "./core/fields";
import type { Region } from "./core/segment";
import type { BlockState } from "./core/align";

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
  viewportWidth: number;
  settled: boolean;
  settleMs: number;
  translated: boolean;
  iframes: number;
  blocks: RenderedBlock[];
  fields: PageFields;
  raw: { first: RawResponse; second: RawResponse; withCookies: RawResponse };
}

/** Panel → content script. */
export type ContentRequest =
  | { type: "snapshot" }
  | { type: "overlay"; states: Record<number, BlockState> | null }
  | { type: "reveal"; id: number };
