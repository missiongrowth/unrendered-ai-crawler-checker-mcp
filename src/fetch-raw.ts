import { CONFIG } from "./config";
import { decodeHtml } from "./core/charset";
import type { RawResponse } from "./messages";

async function readCapped(res: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  if (res.body) {
    const reader = res.body.getReader();
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      const room = CONFIG.rawMaxBytes - size;
      if (r.value.length > room) {
        chunks.push(r.value.subarray(0, room));
        size += room;
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(r.value);
      size += r.value.length;
    }
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.length;
  }
  return { bytes, truncated };
}

/** One uncached GET for HTML, decoded the way a browser would, capped at `CONFIG.rawMaxBytes`. */
export async function fetchRaw(url: string, credentials: RequestCredentials, characterSet: string): Promise<RawResponse> {
  try {
    const res = await fetch(url, { credentials, cache: "no-store", headers: { accept: "text/html" } });
    const { bytes, truncated } = await readCapped(res);
    const { text, encoding } = decodeHtml(bytes, res.headers.get("content-type"), characterSet);
    return {
      ok: true,
      status: res.status,
      url: res.url,
      redirected: res.redirected,
      headers: Object.fromEntries(res.headers),
      html: text,
      encoding,
      truncated,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
