export type CharsetSource = "bom" | "header" | "meta" | "browser";

export interface DecodedHtml {
  text: string;
  encoding: string;
  source: CharsetSource;
}

const HEADER_CHARSET = /charset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s;"']+))/i;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const META_TAG = /<meta(?=[\s/])([^>]*)>?/gi;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const PRESCAN_BYTES = 1024;

function bomEncoding(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  return null;
}

function resolve(label: string | undefined): string | null {
  if (label === undefined || label.trim() === "") return null;
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

function metaCharsets(head: string): string[] {
  const out: string[] = [];
  for (const tag of head.replace(COMMENT, "").matchAll(META_TAG)) {
    const attrs = new Map<string, string>();
    for (const a of (tag[1] ?? "").matchAll(ATTRIBUTE)) {
      const name = (a[1] ?? "").toLowerCase();
      if (!attrs.has(name)) attrs.set(name, a[2] ?? a[3] ?? a[4] ?? "");
    }
    const direct = attrs.get("charset");
    if (direct !== undefined) out.push(direct);
    if (attrs.get("http-equiv")?.toLowerCase() === "content-type") {
      const m = HEADER_CHARSET.exec(attrs.get("content") ?? "");
      if (m !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
    }
  }
  return out;
}

function decode(bytes: Uint8Array, encoding: string, source: CharsetSource): DecodedHtml {
  return { text: new TextDecoder(encoding, { fatal: false }).decode(bytes), encoding, source };
}

/**
 * Character encoding per WHATWG "determining the character encoding":
 * BOM, then the Content-Type charset, then a prescan of the first 1024 bytes for
 * <meta>, then the encoding the browser chose for the live page (the spec leaves
 * this last step to the implementation). Unknown labels fall through to the next
 * source. A meta declaration of UTF-16 means UTF-8 and x-user-defined means
 * windows-1252, as the prescan specifies.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null, browserEncoding: string): DecodedHtml {
  const bom = bomEncoding(bytes);
  if (bom !== null) return decode(bytes, bom, "bom");

  const headerMatch = contentType === null ? null : HEADER_CHARSET.exec(contentType);
  const fromHeader = resolve(headerMatch?.[1] ?? headerMatch?.[2] ?? headerMatch?.[3]);
  if (fromHeader !== null) return decode(bytes, fromHeader, "header");

  const head = new TextDecoder("latin1").decode(bytes.subarray(0, PRESCAN_BYTES));
  for (const label of metaCharsets(head)) {
    const enc = resolve(label);
    if (enc === null) continue;
    const fixed = enc === "utf-16le" || enc === "utf-16be" ? "utf-8" : enc === "x-user-defined" ? "windows-1252" : enc;
    return decode(bytes, fixed, "meta");
  }
  return decode(bytes, resolve(browserEncoding) ?? "utf-8", "browser");
}
