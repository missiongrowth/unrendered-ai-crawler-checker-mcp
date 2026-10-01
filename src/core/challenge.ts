export interface ChallengeInput {
  status: number;
  headers: Headers;
  body: string;
}

export interface ChallengeResult {
  challenged: boolean;
  vendor: string | null;
  signals: string[];
}

interface Vendor {
  name: string;
  /** Header present (optionally matching) is enough to name the vendor. */
  strongHeaders: ReadonlyArray<readonly [string, RegExp | null]>;
  /** Headers every protected page carries, so they only back up a body marker. */
  weakHeaders: ReadonlyArray<readonly [string, RegExp | null]>;
  /** Lower-case substrings of the response body. */
  body: readonly string[];
  /** Block statuses beyond the common 403/429/503. */
  statuses?: readonly number[];
}

const BLOCK_STATUSES = new Set([403, 429, 503]);

const VENDORS: readonly Vendor[] = [
  {
    // https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/
    name: "cloudflare",
    strongHeaders: [["cf-mitigated", /challenge/i]],
    weakHeaders: [["server", /cloudflare/i]],
    body: [
      "just a moment...",
      "/cdn-cgi/challenge-platform/",
      "cf-chl",
      "challenges.cloudflare.com",
      "attention required! | cloudflare",
      "cf-error-details",
    ],
  },
  {
    // https://techdocs.akamai.com/bot-manager/docs/handle-client-side-challenge-actions
    name: "akamai",
    strongHeaders: [],
    weakHeaders: [["server", /akamaighost|akamainetstorage/i], ["x-akamai-transformed", null]],
    body: ["errors.edgesuite.net", "you don't have permission to access", "_abck", "ak_bmsc", "bm-verify"],
  },
  {
    // https://docs.datadome.co/docs/response-headers
    name: "datadome",
    strongHeaders: [["x-datadome", null], ["x-dd-b", null], ["x-datadome-cid", null]],
    weakHeaders: [["server", /datadome/i]],
    body: ["captcha-delivery.com", "ddjskey", "dd_cookie_test"],
  },
  {
    // https://docs.perimeterx.com/pxconsole/docs/block-page
    name: "perimeterx",
    strongHeaders: [],
    weakHeaders: [],
    body: ["px-captcha", "_pxappid", "captcha.px-cdn.net", "client.px-cloud.net", "press & hold"],
  },
  {
    // https://docs.imperva.com/bundle/cloud-application-security/page/more/block-pages.htm
    name: "imperva",
    strongHeaders: [["x-iinfo", null]],
    weakHeaders: [["x-cdn", /imperva|incapsula/i]],
    body: ["_incapsula_resource", "incapsula incident id", "request unsuccessful. incapsula"],
  },
  {
    // https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge-actions.html
    name: "aws-waf",
    strongHeaders: [["x-amzn-waf-action", /challenge|captcha/i]],
    weakHeaders: [],
    body: ["awswafintegration", "token.awswaf.com", "awswaf.com", "aws-waf-token", "awswafcaptcha"],
    statuses: [202, 405],
  },
  {
    // https://docs.sucuri.net/website-firewall/
    name: "sucuri",
    strongHeaders: [["x-sucuri-id", null], ["x-sucuri-block", null]],
    weakHeaders: [["server", /sucuri/i]],
    body: ["sucuri website firewall", "access denied - sucuri", "cloudproxy@sucuri.net", "sucuri.net/privacy"],
  },
  {
    // https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets
    name: "vercel",
    strongHeaders: [["x-vercel-mitigated", /challenge|deny/i]],
    weakHeaders: [["server", /vercel/i]],
    body: ["vercel security checkpoint", "/.well-known/vercel/security/", "we're verifying your browser"],
  },
  {
    // https://www.kasada.io/product/bot-defense/
    name: "kasada",
    strongHeaders: [["x-kpsdk-ct", null], ["x-kpsdk-cd", null], ["x-kpsdk-v", null]],
    weakHeaders: [],
    body: ["kpsdk", "ips.js?"],
    statuses: [429],
  },
  {
    // https://my.f5.com/manage/s/article/K000138182 (rejected-request support ID page)
    name: "f5",
    strongHeaders: [["x-wa-info", null]],
    weakHeaders: [["server", /big-?ip/i]],
    body: ["the requested url was rejected. please consult with your administrator", "your support id is:"],
  },
];

function headerHits(headers: Headers, list: Vendor["strongHeaders"]): string[] {
  const hits: string[] = [];
  for (const [name, pattern] of list) {
    const value = headers.get(name);
    if (value !== null && (pattern === null || pattern.test(value))) hits.push(`header:${name}`);
  }
  return hits;
}

function evaluate(v: Vendor, r: ChallengeInput, body: string): string[] {
  const strong = headerHits(r.headers, v.strongHeaders);
  const markers = v.body.filter((m) => body.includes(m)).map((m) => `body:${m}`);
  if (strong.length === 0 && markers.length === 0) return [];
  const header = strong.length > 0 ? strong : markers.length > 0 ? headerHits(r.headers, v.weakHeaders) : [];
  const blocked = BLOCK_STATUSES.has(r.status) || (v.statuses?.includes(r.status) ?? false);
  return [...header, ...markers, ...(blocked ? [`status:${r.status}`] : [])];
}

function categories(signals: readonly string[]): number {
  return new Set(signals.map((s) => s.slice(0, s.indexOf(":")))).size;
}

/**
 * A response counts as challenged only when two independent kinds of evidence
 * agree (vendor header, body marker, block status), so an article that merely
 * mentions a vendor or ships one marker on a 200 page is left alone.
 */
export function detectChallenge(r: ChallengeInput): ChallengeResult {
  const body = r.body.toLowerCase();
  let best: { vendor: string; signals: string[] } | null = null;
  for (const v of VENDORS) {
    const signals = evaluate(v, r, body);
    if (signals.length > 0 && (best === null || categories(signals) > categories(best.signals))) {
      best = { vendor: v.name, signals };
    }
  }
  if (best === null) return { challenged: false, vendor: null, signals: [] };
  return { challenged: categories(best.signals) >= 2, vendor: best.vendor, signals: best.signals };
}
