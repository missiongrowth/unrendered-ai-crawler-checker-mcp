export interface ScriptData {
  /** String leaves of every `application/ld+json` block. */
  structured: string[];
  /** String leaves of known hydration containers. */
  hydration: string[];
  /** Data scripts that matched a known container but could not be parsed. */
  unparsed: number;
}

const collect = (value: unknown, out: string[]) => {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) collect(v, out);
  else if (value !== null && typeof value === "object") for (const v of Object.values(value)) collect(v, out);
};

const tryJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
};

/** Framework-owned JSON islands (Next.js pages router, Nuxt 3). Unknown JSON islands may be i18n dictionaries, so they are not used. */
const HYDRATION_IDS = new Set(["__NEXT_DATA__", "__NUXT_DATA__"]);
/** React Server Components flight rows pushed via `self.__next_f.push([1, "..."])`. */
const NEXT_F = /self\.__next_f\.push\((\[[\s\S]*?\])\)\s*;?\s*$/;
/** Text rows of the flight format: `<id>:T<hexlen>,<text>`. */
const FLIGHT_TEXT_ROW = /^[0-9a-f]+:T[0-9a-f]+,/;
const FLIGHT_ROW = /^[0-9a-f]+:/;

function flightLeaves(payload: string, out: string[]) {
  for (const row of payload.split("\n")) {
    if (FLIGHT_TEXT_ROW.test(row)) {
      out.push(row.replace(FLIGHT_TEXT_ROW, ""));
      continue;
    }
    const parsed = tryJson(row.replace(FLIGHT_ROW, ""));
    if (parsed.ok) collect(parsed.value, out);
  }
}

/**
 * Text a non-JS client receives only as data, never as markup. Generic inline
 * JavaScript string literals are deliberately ignored: they mix UI copy,
 * i18n dictionaries and code, so they cannot be attributed to the page.
 */
export function scriptData(doc: Document): ScriptData {
  const structured: string[] = [];
  const hydration: string[] = [];
  let unparsed = 0;

  for (const script of doc.querySelectorAll("script")) {
    const type = (script.getAttribute("type") ?? "").trim().toLowerCase();
    const text = script.textContent;
    if (type === "application/ld+json") {
      const parsed = tryJson(text);
      if (parsed.ok) collect(parsed.value, structured);
      else unparsed++;
      continue;
    }
    if (HYDRATION_IDS.has(script.id) || script.hasAttribute("data-sveltekit-fetched")) {
      const parsed = tryJson(text);
      if (parsed.ok) collect(parsed.value, hydration);
      else unparsed++;
      continue;
    }
    const flight = NEXT_F.exec(text.trim());
    if (flight?.[1] !== undefined) {
      const parsed = tryJson(flight[1]);
      if (parsed.ok && Array.isArray(parsed.value)) {
        for (const part of parsed.value) if (typeof part === "string") flightLeaves(part, hydration);
      } else unparsed++;
    }
  }
  return { structured, hydration, unparsed };
}
