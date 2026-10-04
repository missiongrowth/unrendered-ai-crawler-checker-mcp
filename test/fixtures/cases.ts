import type { BlockState } from "../../src/core/align";

/** Hand-checked states for one exact block text, one entry per copy of that text on the rendered page. */
export interface Annotation {
  text: string;
  states: BlockState[];
  /** Other state lists that are equally correct, for races the fixture cannot pin down. */
  alternatives?: BlockState[][];
}

export interface FixtureCase {
  name: string;
  /** Path loaded in the browser (may redirect or push state). */
  goto: string;
  /** Path the JS-off oracle loads when the analysed URL differs from `goto` (history.pushState). */
  offGoto?: string;
  /** URL path the tab must reach before the click. */
  settledPath?: string;
  cookies?: { name: string; value: string }[];
  /** Overrides the JS-off/JS-on derivation for blocks the oracle cannot classify (data-only text, repeated text, partial text). */
  annotations?: Annotation[];
  /** Rows the page oracle cannot see (closed shadow roots), with their hand-checked state. */
  extra?: Annotation[];
  /** Raw responses differ per request, so a separate JS-off load is not the extension's raw fetch. */
  dynamic?: boolean;
  /** Compare the Fields tab with the JS-off/JS-on head of the page. */
  fields?: boolean;
}

export const CASES: readonly FixtureCase[] = [
  { name: "ssr-article", goto: "/p/ssr-article" },
  { name: "csr-shell", goto: "/p/csr-shell" },
  {
    name: "next-data",
    goto: "/p/next-data",
    annotations: [
      { text: "Pricing guide for the Atlas workbench", states: ["hydration-data"] },
      { text: "The Atlas workbench ships flat packed and needs two people to assemble it in under an hour.", states: ["hydration-data"] },
      { text: "Flight rows carry this paragraph about warranty terms for the Atlas workbench", states: ["hydration-data"] },
    ],
  },
  { name: "i18n-dict", goto: "/p/i18n-dict" },
  {
    name: "repeated-grid",
    goto: "/p/repeated-grid",
    annotations: [{ text: "Add to cart", states: ["server", "server", "server", "server", "ambiguous", "ambiguous"] }],
  },
  { name: "tabs-accordion", goto: "/p/tabs-accordion" },
  { name: "js-faq", goto: "/p/js-faq" },
  {
    name: "js-partial",
    goto: "/p/js-partial",
    annotations: [{ text: "Free shipping on all orders over fifty euros for members this week only", states: ["partial"] }],
  },
  { name: "js-meta", goto: "/p/js-meta", fields: true },
  { name: "jsonld-injected", goto: "/p/jsonld-injected", fields: true },
  { name: "jsonld-price", goto: "/p/jsonld-price", fields: true },
  { name: "dsd", goto: "/p/dsd" },
  {
    name: "closed-shadow",
    goto: "/p/closed-shadow",
    extra: [{ text: "This paragraph is rendered inside a closed shadow root by script only.", states: ["js-added"] }],
  },
  { name: "iframe", goto: "/p/iframe" },
  { name: "cmp-banner", goto: "/p/cmp-banner" },
  { name: "multilang", goto: "/p/multilang" },
  { name: "turkish-header-windows-1254", goto: "/p/turkish-header" },
  { name: "turkish-meta-windows-1254", goto: "/p/turkish-meta" },
  { name: "turkish-bom-over-header", goto: "/p/turkish-bom" },
  {
    name: "cookie-dependent",
    goto: "/p/cookie-dependent",
    cookies: [{ name: "sid", value: "member" }],
    dynamic: true,
    annotations: [{ text: "Welcome back, your saved plan is the Pro plan.", states: ["js-added"] }],
  },
  {
    // The extension fires fetch A, B and C at once, so which of A and B the server sees first is a race:
    // the rendered text is in A ("server") or only in B ("volatile"). Never "js-added" or "partial".
    // The cookie keeps fetch C (with cookies) out of the alternation. The deterministic volatile case lives in core.spec.ts.
    name: "ab-alternating",
    goto: "/p/ab-parity",
    cookies: [{ name: "ab", value: "1" }],
    dynamic: true,
    annotations: [{ text: "Crimson bicycle bundle ships tomorrow morning.", states: ["volatile"], alternatives: [["server"]] }],
  },
  { name: "ab-random", goto: "/p/ab-random", dynamic: true },
  { name: "geo-redirect", goto: "/p/geo" },
  { name: "spa-pushstate", goto: "/spa/start", settledPath: "/spa/products", offGoto: "/spa/products" },
  { name: "spa-hash", goto: "/p/spa-hash#/about" },
];

/** Bots with a documented user-agent string get a verdict on `/ua/mixed`; the others are not probed. Hand-checked against server.mjs. */
export const MIXED_VERDICTS: Record<string, string> = {
  GPTBot: "blocked",
  "OAI-SearchBot": "challenged",
  "ChatGPT-User": "different",
  PerplexityBot: "rate-limited",
  "Perplexity-User": "redirected-elsewhere",
  ClaudeBot: "same",
  "Claude-User": "same",
  "Meta-ExternalAgent": "same",
  "Meta-ExternalFetcher": "error",
  Amazonbot: "same",
  "Amzn-SearchBot": "same",
  "Amzn-User": "same",
  "MistralAI-User": "same",
  "MistralAI-Index": "same",
  "MistralAI-Training": "same",
  DuckAssistBot: "same",
  CCBot: "same",
};

/** Hand-checked against ROBOTS_MAIN in server.mjs for the path `/ua/mixed`; tokens not listed are allowed. */
export const MIXED_DISALLOWED: readonly string[] = ["GPTBot", "ClaudeBot", "Amazonbot", "Amzn-User"];
