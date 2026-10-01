export type Region = "main" | "header" | "nav" | "aside" | "footer" | "dialog" | "other";

export interface Segment {
  el: Element;
  tag: string;
  text: string;
  region: Region;
}

export interface SegmentOptions {
  /** Shadow root to descend into for `el`, if any (closed roots need chrome.dom in a content script). */
  shadowRootOf: (el: Element) => ShadowRoot | null;
  /** Raw HTML keeps `<noscript>` text (a client without JS shows it); the rendered page does not. */
  includeNoscript: boolean;
}

/** Elements whose text is one unit even when it is split across inline children. */
const BLOCK_TAGS = new Set([
  "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "DT", "DD", "BLOCKQUOTE", "FIGCAPTION",
  "PRE", "SUMMARY", "CAPTION", "LABEL", "BUTTON", "OPTION", "LEGEND", "ADDRESS",
]);

/** Phrasing elements: their text joins the enclosing unit instead of starting a new one. */
const INLINE_TAGS = new Set([
  "A", "ABBR", "B", "BDI", "BDO", "BIG", "CITE", "CODE", "DATA", "DEL", "DFN", "EM", "FONT", "I", "INS",
  "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "TIME", "TT", "U",
  "VAR", "SLOT", "OUTPUT", "METER", "PROGRESS", "RUBY", "RT", "RP",
]);

/** Subtrees that never contribute page text. */
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "SVG", "MATH", "IFRAME", "OBJECT", "EMBED", "CANVAS", "TEXTAREA", "HEAD"]);

const REGION_ROLES: Record<string, Region> = {
  main: "main", banner: "header", navigation: "nav", complementary: "aside", contentinfo: "footer", dialog: "dialog", alertdialog: "dialog",
};
const REGION_TAGS: Record<string, Region> = { MAIN: "main", HEADER: "header", NAV: "nav", ASIDE: "aside", FOOTER: "footer", DIALOG: "dialog" };

/** Nearest landmark, walking up through shadow hosts. */
function regionOf(el: Element): Region {
  for (let node: Element | null = el; node; ) {
    const role = node.getAttribute("role");
    const byRole = role === null ? undefined : REGION_ROLES[role];
    if (byRole) return byRole;
    if (node.getAttribute("aria-modal") === "true") return "dialog";
    const byTag = REGION_TAGS[node.tagName.toUpperCase()];
    if (byTag) return byTag;
    const parent: Element | null = node.parentElement;
    if (parent) node = parent;
    else {
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
  }
  return "other";
}

/**
 * Splits a subtree into text units in document order, walking the flattened
 * tree (shadow roots and slot assignments) so slotted text is counted once.
 * The same function runs on the live page and on the parsed server HTML,
 * so both sides are cut identically.
 */
export function segment(root: Element, options: SegmentOptions): Segment[] {
  const units: { el: Element; parts: string[] }[] = [];

  const childrenOf = (node: Node): Iterable<Node> => {
    if (node instanceof Element) {
      if (node.tagName.toUpperCase() === "SLOT") {
        const assigned = (node as HTMLSlotElement).assignedNodes({ flatten: true });
        if (assigned.length > 0) return assigned;
      }
      const shadow = options.shadowRootOf(node);
      if (shadow) return shadow.childNodes;
    }
    return node.childNodes;
  };

  const walk = (node: Node, unit: { el: Element; parts: string[] }) => {
    for (const child of childrenOf(node)) {
      if (child.nodeType === Node.TEXT_NODE) {
        unit.parts.push((child as Text).data);
        continue;
      }
      if (!(child instanceof Element)) continue;
      const tag = child.tagName.toUpperCase();
      if (SKIP_TAGS.has(tag) || (tag === "NOSCRIPT" && !options.includeNoscript)) continue;
      if (tag === "BR" || tag === "WBR" || tag === "HR" || tag === "IMG") {
        unit.parts.push(" ");
        continue;
      }
      if (INLINE_TAGS.has(tag) && !BLOCK_TAGS.has(tag)) {
        walk(child, unit);
        continue;
      }
      unit.parts.push(" ");
      const own = { el: child, parts: [] as string[] };
      units.push(own);
      walk(child, own);
    }
  };

  const top = { el: root, parts: [] as string[] };
  units.push(top);
  walk(root, top);

  const out: Segment[] = [];
  for (const { el, parts } of units) {
    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (text) out.push({ el, tag: el.tagName.toLowerCase(), text, region: regionOf(el) });
  }
  return out;
}
