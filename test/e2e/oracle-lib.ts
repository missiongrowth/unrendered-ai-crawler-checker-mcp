import type { Page } from "@playwright/test";
import type { BlockState } from "../../src/core/align";
import type { Annotation } from "../fixtures/cases";
import type { PanelRow } from "./harness";

/** Fixture pages keep all text in these elements, so a leaf of this selector is one block. */
const BLOCK_SELECTOR = "p,li,h1,h2,h3,h4,h5,h6,td,th,dt,dd,blockquote,figcaption,pre,summary,caption,label,button,legend,address";

export interface PageBlock {
  text: string;
  region: "main" | "dialog" | "other";
  hidden: boolean;
}

export interface PageSnapshot {
  blocks: PageBlock[];
  hasMainLandmark: boolean;
}

/** Text blocks of the live DOM (open shadow roots included), derived without any extension code. */
export function collectBlocks(page: Page): Promise<PageSnapshot> {
  return page.evaluate((selector) => {
    const blocks: PageBlock[] = [];
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const regionOf = (el: Element): PageBlock["region"] => {
      for (let node: Element | null = el; node; ) {
        const role = node.getAttribute("role");
        if (role === "dialog" || role === "alertdialog" || node.getAttribute("aria-modal") === "true" || node.tagName === "DIALOG") return "dialog";
        if (role === "main" || node.tagName === "MAIN") return "main";
        if (["banner", "navigation", "complementary", "contentinfo"].includes(role ?? "") || ["HEADER", "NAV", "ASIDE", "FOOTER"].includes(node.tagName)) return "other";
        const root: Node = node.getRootNode();
        node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
      return "other";
    };
    const walk = (root: Document | ShadowRoot) => {
      for (const el of root.querySelectorAll(selector)) {
        if (el.querySelector(selector) !== null) continue;
        const text = clean(el.textContent);
        if (text !== "") blocks.push({ text, region: regionOf(el), hidden: !el.checkVisibility() });
      }
      for (const host of root.querySelectorAll("*")) if (host.shadowRoot) walk(host.shadowRoot);
    };
    walk(document);
    return { blocks, hasMainLandmark: document.querySelector("main,[role=main]") !== null };
  }, BLOCK_SELECTOR);
}

/** JS-off page text with noscript as markup, which is what a client without JavaScript shows. */
export const blockTexts = (snapshot: PageSnapshot): string[] => snapshot.blocks.map((b) => b.text);

export const countBy = (texts: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const t of texts) counts.set(t, (counts.get(t) ?? 0) + 1);
  return counts;
};

/** Expected state per distinct rendered text: annotation when given, else server if the JS-off page has it, else js-added. */
export function expectedStates(on: readonly string[], off: readonly string[], annotations: readonly Annotation[]): Map<string, BlockState[]> {
  const out = new Map<string, BlockState[]>();
  for (const [text, count] of countBy(on)) {
    const annotated = annotations.find((a) => a.text === text);
    if (annotated) {
      out.set(text, annotated.states);
      continue;
    }
    const state: BlockState = off.some((o) => o.includes(text)) ? "server" : "js-added";
    out.set(text, Array<BlockState>(count).fill(state));
  }
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word occurrence, so "$10" does not match inside "$100". */
const occurs = (haystack: string, needle: string) => new RegExp(`(?<![\\p{L}\\p{N}$])${escapeRegExp(needle)}(?![\\p{L}\\p{N}])`, "u").test(haystack);

/** Groups panel rows by the longest expected text they contain; rows owned by no text are returned as `orphans`. */
export function groupRows(rows: readonly PanelRow[], texts: Iterable<string>): { groups: Map<string, PanelRow[]>; orphans: PanelRow[] } {
  const sorted = [...texts].sort((a, b) => b.length - a.length);
  const groups = new Map<string, PanelRow[]>(sorted.map((t) => [t, []]));
  const orphans: PanelRow[] = [];
  for (const row of rows) {
    const owner = sorted.find((t) => occurs(row.text, t));
    if (owner === undefined) orphans.push(row);
    else groups.get(owner)?.push(row);
  }
  return { groups, orphans };
}

export interface StateMismatch {
  text: string;
  expected: string[];
  actual: string[];
}

export function diffStates(expected: Map<string, BlockState[]>, groups: Map<string, PanelRow[]>): StateMismatch[] {
  const out: StateMismatch[] = [];
  for (const [text, states] of expected) {
    const actual = (groups.get(text) ?? []).map((r) => r.state).sort();
    const want = [...states].sort();
    if (actual.length !== want.length || actual.some((s, i) => s !== want[i])) out.push({ text, expected: want, actual });
  }
  return out;
}

/** Share of main or all visible text the server HTML has, when the oracle fixes it at an extreme; null when it is a mix. */
export function extremeCoverage(
  snapshot: PageSnapshot,
  expected: Map<string, BlockState[]>,
  scope: "main" | "all" | "hidden",
): "100%" | "0%" | null {
  const mainRegion = snapshot.hasMainLandmark ? "main" : "other";
  const seen = new Map<string, number>();
  const states: BlockState[] = [];
  for (const b of snapshot.blocks) {
    const i = seen.get(b.text) ?? 0;
    seen.set(b.text, i + 1);
    const inScope =
      scope === "hidden" ? b.hidden : !b.hidden && b.region !== "dialog" && (scope === "all" || b.region === mainRegion);
    const state = expected.get(b.text)?.[i];
    if (inScope && state !== undefined) states.push(state);
  }
  if (states.length === 0) return null;
  if (states.every((s) => s === "server")) return "100%";
  if (states.every((s) => s === "js-added")) return "0%";
  return null;
}

export interface HeadFacts {
  title: string[];
  description: string[];
  canonical: string[];
  robots: string[];
  jsonLd: Record<string, string[]>;
}

/** Head facts as the page itself reports them; JSON-LD paths are the ones the fixtures use. */
export function collectHead(page: Page): Promise<HeadFacts> {
  return page.evaluate(() => {
    const clean = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
    const list = (values: (string | null)[]) => values.map(clean).filter((v) => v !== "");
    const jsonLd: Record<string, string[]> = {};
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const node = JSON.parse(script.textContent) as { "@type": string; name?: string; offers?: { price?: string; priceCurrency?: string } };
      const type = `JSON-LD ${node["@type"]}`;
      jsonLd[type] = ["present"];
      if (node.name !== undefined) jsonLd[`${type} › name`] = [node.name];
      if (node.offers?.price !== undefined) jsonLd[`${type} › offers.price`] = [node.offers.price];
      if (node.offers?.priceCurrency !== undefined) jsonLd[`${type} › offers.priceCurrency`] = [node.offers.priceCurrency];
    }
    return {
      title: list([document.querySelector("title")?.textContent ?? null]),
      description: list([...document.querySelectorAll('meta[name="description"]')].map((m) => m.getAttribute("content"))),
      canonical: [...document.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')].map((l) => l.href),
      robots: list([...document.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute("content"))),
      jsonLd,
    };
  });
}

type FieldState = "same" | "changed" | "added-by-js" | "removed-by-js" | "absent";

const fieldState = (server: string[], rendered: string[]): FieldState => {
  if (server.length === 0 && rendered.length === 0) return "absent";
  if (server.length === 0) return "added-by-js";
  if (rendered.length === 0) return "removed-by-js";
  return server.length === rendered.length && server.every((v, i) => v === rendered[i]) ? "same" : "changed";
};

/** Field label (as the panel shows it) to expected state, from the JS-off and JS-on heads. */
export function expectedFieldStates(off: HeadFacts, on: HeadFacts): Map<string, FieldState> {
  const out = new Map<string, FieldState>([
    ["Title", fieldState(off.title, on.title)],
    ["Meta description", fieldState(off.description, on.description)],
    ["Canonical", fieldState(off.canonical, on.canonical)],
    ["meta robots", fieldState(off.robots, on.robots)],
  ]);
  for (const key of new Set([...Object.keys(off.jsonLd), ...Object.keys(on.jsonLd)])) {
    out.set(key, fieldState(off.jsonLd[key] ?? [], on.jsonLd[key] ?? []));
  }
  return out;
}
