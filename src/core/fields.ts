export interface JsonLdNode {
  /** `@id`, else `@type` joined with "|". */
  key: string;
  type: string;
  /** Allow-listed property paths that carry facts AI answers quote (price, rating, dates, names). */
  props: Record<string, string[]>;
}

export interface PageFields {
  title: string | null;
  description: string | null;
  lang: string | null;
  canonical: string[];
  hreflang: string[];
  /** `content` of meta elements named `robots` or a crawler token, keyed by lower-case name. */
  robotsMeta: Record<string, string[]>;
  links: string[];
  nofollowLinks: string[];
  jsonLd: JsonLdNode[];
  jsonLdInvalid: number;
}

const PROP_PATHS = [
  "name", "headline", "author.name", "datePublished", "dateModified",
  "offers.price", "offers.lowPrice", "offers.highPrice", "offers.priceCurrency", "offers.availability",
  "aggregateRating.ratingValue", "aggregateRating.reviewCount",
] as const;

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const scalar = (v: unknown): string | null => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : null);

function valuesAt(node: unknown, path: readonly string[]): string[] {
  const [head, ...rest] = path;
  if (head === undefined) {
    const s = scalar(node);
    return s === null ? [] : [s.trim()];
  }
  if (node === null || typeof node !== "object") return [];
  return asList((node as Record<string, unknown>)[head]).flatMap((child) => valuesAt(child, rest));
}

function jsonLdNodes(value: unknown, out: JsonLdNode[]) {
  for (const item of asList(value)) {
    if (item === null || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if ("@graph" in obj) jsonLdNodes(obj["@graph"], out);
    const types = asList(obj["@type"]).map(scalar).filter((t): t is string => t !== null);
    if (types.length === 0) continue;
    const type = types.join("|");
    const props: Record<string, string[]> = {};
    for (const path of PROP_PATHS) {
      const values = valuesAt(obj, path.split("."));
      if (values.length > 0) props[path] = values;
    }
    out.push({ key: scalar(obj["@id"]) ?? type, type, props });
  }
}

const clean = (s: string | null | undefined) => {
  const t = s?.replace(/\s+/g, " ").trim();
  return t ? t : null;
};

/**
 * Reads the same facts from the live document and from the parsed server HTML.
 * URLs resolve against `<base href>` then the page URL, never `document.baseURI`,
 * because a parsed document's base is the extension page.
 */
export function readFields(doc: Document, pageUrl: string, crawlerTokens: readonly string[]): PageFields {
  const resolve = (href: string | null, base: string): string | null => {
    if (href === null) return null;
    try {
      const u = new URL(href.trim(), base);
      u.hash = "";
      return u.href;
    } catch {
      return null;
    }
  };
  const base = resolve(doc.querySelector("base[href]")?.getAttribute("href") ?? null, pageUrl) ?? pageUrl;
  const metaNames = new Set(["robots", ...crawlerTokens.map((t) => t.toLowerCase())]);

  const robotsMeta: Record<string, string[]> = {};
  for (const meta of doc.querySelectorAll("meta[name][content]")) {
    const name = (meta.getAttribute("name") ?? "").trim().toLowerCase();
    const content = clean(meta.getAttribute("content"));
    if (metaNames.has(name) && content !== null) (robotsMeta[name] ??= []).push(content);
  }

  const relHas = (el: Element, token: string) => (el.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).includes(token);
  const canonical: string[] = [];
  const hreflang: string[] = [];
  for (const link of doc.querySelectorAll("link[rel][href]")) {
    const href = resolve(link.getAttribute("href"), base);
    if (href === null) continue;
    if (relHas(link, "canonical")) canonical.push(href);
    const lang = link.getAttribute("hreflang");
    if (relHas(link, "alternate") && lang) hreflang.push(`${lang.trim().toLowerCase()} ${href}`);
  }

  const links = new Set<string>();
  const nofollowLinks = new Set<string>();
  for (const a of doc.querySelectorAll("body a[href]")) {
    const href = resolve(a.getAttribute("href"), base);
    if (href === null || !/^https?:/.test(href)) continue;
    links.add(href);
    if (relHas(a, "nofollow")) nofollowLinks.add(href);
  }

  const jsonLd: JsonLdNode[] = [];
  let jsonLdInvalid = 0;
  for (const script of doc.querySelectorAll('script[type="application/ld+json" i]')) {
    try {
      jsonLdNodes(JSON.parse(script.textContent), jsonLd);
    } catch {
      jsonLdInvalid++;
    }
  }

  return {
    title: clean(doc.querySelector("title")?.textContent),
    description: clean(doc.querySelector('meta[name="description" i]')?.getAttribute("content")),
    lang: clean(doc.documentElement.getAttribute("lang")),
    canonical,
    hreflang: hreflang.sort(),
    robotsMeta,
    links: [...links],
    nofollowLinks: [...nofollowLinks],
    jsonLd,
    jsonLdInvalid,
  };
}
