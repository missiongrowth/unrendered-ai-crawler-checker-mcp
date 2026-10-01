const KNOWN = new Set([
  "all",
  "none",
  "noindex",
  "nofollow",
  "nosnippet",
  "indexifembedded",
  "notranslate",
  "noimageindex",
  "noarchive",
  "nocache",
  "noodp",
  "noydir",
  "nositelinkssearchbox",
  "max-snippet",
  "max-image-preview",
  "max-video-preview",
  "unavailable_after",
]);
const PREFIX = /^([^:\s]+)\s*:\s*(.*)$/;

function startsNewItem(piece: string): boolean {
  const lower = piece.toLowerCase();
  if (KNOWN.has(lower)) return true;
  const m = PREFIX.exec(lower);
  return m !== null;
}

function add(map: Map<string, Set<string>>, token: string, directive: string): void {
  let set = map.get(token);
  if (set === undefined) map.set(token, (set = new Set()));
  set.add(directive);
}

/**
 * Parses X-Robots-Tag and meta robots values. A "token:" prefix scopes the
 * directives after it, but only when the name is not itself a directive, so
 * "max-snippet:20" and "unavailable_after: 25 Jun 2010 15:00:00 PST" (which
 * contains commas and colons) are never mistaken for a user-agent prefix.
 */
export function parseRobotsDirectives(values: readonly string[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const value of values) {
    const pieces = value.split(",").map((p) => p.trim());
    let token = "*";
    for (let i = 0; i < pieces.length; i++) {
      let piece = pieces[i] ?? "";
      const prefix = PREFIX.exec(piece);
      if (prefix !== null && !KNOWN.has((prefix[1] ?? "").toLowerCase())) {
        token = (prefix[1] ?? "").toLowerCase();
        piece = prefix[2] ?? "";
      }
      const named = PREFIX.exec(piece);
      if (named !== null) {
        const name = (named[1] ?? "").toLowerCase();
        let arg = (named[2] ?? "").trim();
        if (name === "unavailable_after") {
          while (i + 1 < pieces.length && !startsNewItem(pieces[i + 1] ?? "")) arg += `, ${pieces[++i] ?? ""}`;
          arg = arg.replace(/\s+/g, " ").trim().toLowerCase();
        }
        if (arg !== "") add(map, token, `${name}:${arg.replace(/\s+/g, " ").toLowerCase()}`);
      } else if (piece !== "") {
        add(map, token, piece.toLowerCase());
      }
    }
  }
  return map;
}

export function isNoindex(d: Map<string, Set<string>>, token: string): boolean {
  return ["*", token.toLowerCase()].some((t) => {
    const set = d.get(t);
    return set !== undefined && (set.has("noindex") || set.has("none"));
  });
}
