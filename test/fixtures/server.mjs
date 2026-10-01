import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import http from "node:http";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const ROLES = ["main", "other", "robots500", "robots404", "robotsRedirect"];

/** Server-side windows-1254 encoder: only the Turkish letters differ from Latin-1 in the fixture text. */
const CP1254 = new Map(
  Object.entries({ Ş: 0xde, ş: 0xfe, İ: 0xdd, ı: 0xfd, Ğ: 0xd0, ğ: 0xf0, Ç: 0xc7, ç: 0xe7, Ö: 0xd6, ö: 0xf6, Ü: 0xdc, ü: 0xfc }),
);

function encode1254(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const mapped = code < 0x80 ? code : CP1254.get(ch);
    if (mapped === undefined) throw new Error(`no windows-1254 byte for ${ch}`);
    bytes.push(mapped);
  }
  return Buffer.from(bytes);
}

const ROBOTS_MAIN = `User-agent: *
Disallow: /private/

User-agent: GPTBot
Disallow: /ua/

user-agent: claudebot
Disallow: /ua/

User-agent: Amazonbot
User-agent: Amzn-User
Disallow: /ua/

User-agent: PerplexityBot
Disallow: /ua/
Allow: /ua/mixed

User-agent: OAI-SearchBot

Content-Signal: ai-train=no, search=yes
`;

const ROBOTS_REDIRECT_TARGET = `User-agent: GPTBot
Disallow: /
`;

const WORDS = [
  "amber", "basalt", "cedar", "dune", "ember", "fjord", "garnet", "harbor", "indigo", "juniper", "kelp", "lagoon", "marble",
  "nectar", "obsidian", "pebble", "quartz", "reed", "saffron", "tundra", "umber", "velvet", "willow", "xenon", "yarrow", "zephyr",
  "anvil", "birch", "cobalt", "delta", "elm", "flint", "glacier", "heron", "iris", "jade", "koala", "lotus", "meadow", "nimbus",
  "orchid", "prairie", "quill", "raven", "sorrel", "thistle", "umbra", "violet", "walnut", "yucca", "zinnia", "aspen", "bramble",
  "clover", "dahlia", "fern", "gorse", "hazel", "ivy", "jasmine", "lilac", "myrtle", "nettle",
];

const randomSentence = () => {
  const pick = new Set();
  while (pick.size < 8) pick.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return [...pick].join(" ");
};

/** Probed bots, matched on the user-agent token; anything else gets the plain page. */
const UA_RULES = [
  { re: /GPTBot\//i, action: "blocked" },
  { re: /OAI-SearchBot\//i, action: "challenge" },
  { re: /ChatGPT-User\//i, action: "different" },
  { re: /PerplexityBot\//i, action: "rate-limited" },
  { re: /Perplexity-User\//i, action: "redirect" },
  { re: /meta-externalfetcher\//i, action: "reset" },
];

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Starts the fixture origins: `main`, `other` (cross-origin redirect target), and three
 * origins that differ only in how robots.txt behaves. `basePort` 0 picks free ports.
 */
export async function startFixtureServers(basePort = 0) {
  const origins = {};
  const log = [];
  const counters = new Map();

  const page = async (name, vars = {}) => {
    let html = await readFile(fileURLToPath(new URL(`./pages/${name}.html`, import.meta.url)), "utf8");
    html = html.replaceAll("{{OTHER}}", origins.other);
    for (const [key, value] of Object.entries(vars)) html = html.replaceAll(`{{${key}}}`, value);
    return html;
  };

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "cache-control": "no-store", "content-type": "text/html; charset=utf-8", ...headers });
    res.end(body);
  };

  const nextCount = (key) => {
    const n = counters.get(key) ?? 0;
    counters.set(key, n + 1);
    return n;
  };

  const robots = (role, res) => {
    if (role === "robots500") return send(res, 500, "server error", { "content-type": "text/plain" });
    if (role === "robots404") return send(res, 404, "not found", { "content-type": "text/plain" });
    if (role === "robotsRedirect") {
      res.writeHead(301, { location: "/robots-real.txt", "cache-control": "no-store" });
      return res.end();
    }
    return send(res, 200, ROBOTS_MAIN, { "content-type": "text/plain" });
  };

  const uaMixed = async (req, res) => {
    const rule = UA_RULES.find(({ re }) => re.test(req.headers["user-agent"] ?? ""));
    switch (rule?.action) {
      case "blocked":
        return send(res, 403, "forbidden", { "content-type": "text/plain" });
      case "challenge":
        return send(res, 200, await page("ua-challenge"), { "cf-mitigated": "challenge" });
      case "different":
        return send(res, 200, await page("ua-different"));
      case "rate-limited":
        return send(res, 429, "slow down", { "content-type": "text/plain", "retry-after": "60" });
      case "redirect":
        res.writeHead(302, { location: `${origins.other}/ua/landed`, "cache-control": "no-store" });
        return res.end();
      case "reset":
        return req.socket.destroy();
      default:
        return send(res, 200, await page("ua-page"));
    }
  };

  /** Navigations get the real page; the extension's fetch (any other fetch mode) gets the failure under test. */
  const gatePage = async (name, req, res) => {
    if (req.headers["sec-fetch-mode"] === "navigate") return send(res, 200, await page("ssr-article"));
    if (name === "gate-status") return send(res, 403, "forbidden", { "content-type": "text/plain" });
    if (name === "gate-challenge") return send(res, 200, await page("ua-challenge"), { "cf-mitigated": "challenge" });
    res.writeHead(302, { location: "/p/geo-landing", "cache-control": "no-store" });
    return res.end();
  };

  const dynamicPage = async (name, req, res) => {
    const cookie = req.headers.cookie ?? "";
    switch (name) {
      case "geo":
        res.writeHead(302, { location: `${origins.other}/p/geo-landing`, "cache-control": "no-store" });
        return res.end();
      case "cookie-dependent": {
        const greeting = /(?:^|;\s*)sid=member(?:;|$)/.test(cookie)
          ? "Welcome back, your saved plan is the Pro plan."
          : "Please sign in to see your saved plan.";
        return send(res, 200, await page("cookie-dependent", { GREETING: greeting }));
      }
      case "ab-parity": {
        // Even requests get red, odd get blue: page load, fetch A and fetch B see red, blue, red.
        const red = nextCount("ab-parity") % 2 === 0;
        // No shared words, so a mismatch is never read as a partial match.
        const variant = red ? "Crimson bicycle bundle ships tomorrow morning." : "Azure kayak paddles arrive next weekend.";
        return send(res, 200, await page("variant", { VARIANT: variant }));
      }
      case "ab-random":
        return send(res, 200, await page("variant", { VARIANT: randomSentence() }));
      case "turkish-header":
        return send(res, 200, encode1254(await page("turkish", { CHARSET_META: "" })), { "content-type": "text/html; charset=windows-1254" });
      case "turkish-meta":
        return send(res, 200, encode1254(await page("turkish", { CHARSET_META: '<meta charset="windows-1254">' })), { "content-type": "text/html" });
      case "turkish-bom":
        return send(res, 200, Buffer.concat([BOM, Buffer.from(await page("turkish", { CHARSET_META: "" }), "utf8")]), {
          "content-type": "text/html; charset=windows-1254",
        });
      case "big": {
        const rows = Array.from({ length: 5000 }, (_, i) => `<p>Paragraph number ${i} of the stress page carries the marker word marker${i} for alignment.</p>`);
        return send(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture: 5000 blocks</title></head><body><main><h1>Stress page</h1>${rows.join("\n")}</main></body></html>`);
      }
      case "gate-status":
      case "gate-challenge":
      case "gate-redirect":
        return gatePage(name, req, res);
      case "spa-hash":
        return send(res, 200, await page("spa-shell"));
      default:
        return undefined;
    }
  };

  const handler = (role) => async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fixture.invalid");
    log.push({ port: req.socket.localPort ?? 0, method: req.method ?? "GET", path: url.pathname + url.search, headers: { ...req.headers } });
    const path = url.pathname;

    if (path === "/robots.txt") return robots(role, res);
    if (path === "/robots-real.txt") return send(res, 200, ROBOTS_REDIRECT_TARGET, { "content-type": "text/plain" });
    if (path === "/favicon.ico") return send(res, 204, "");
    if (path === "/echo") {
      return send(res, 200, JSON.stringify({ method: req.method, url: req.url, headers: req.headers, rawHeaders: req.rawHeaders }), {
        "content-type": "application/json",
      });
    }
    if (path === "/ua/mixed") return uaMixed(req, res);
    // A live page can change between two requests: ChatGPT-User's first request gets another page, later ones the same page.
    if (path === "/ua/flaky") {
      const first = /ChatGPT-User\//i.test(req.headers["user-agent"] ?? "") && nextCount("flaky") === 0;
      return send(res, 200, await page(first ? "ua-different" : "ua-page"));
    }
    if (path === "/ua/echo" || path === "/ua/landed") return send(res, 200, await page("ua-page"));
    if (path.startsWith("/spa/")) return send(res, 200, await page("spa-shell"));

    const match = /^\/p\/([a-z0-9-]+)$/.exec(path);
    if (match?.[1] !== undefined) {
      const name = match[1];
      if ((await dynamicPage(name, req, res)) !== undefined || res.writableEnded) return undefined;
      try {
        return send(res, 200, await page(name));
      } catch {
        return send(res, 404, "not found", { "content-type": "text/plain" });
      }
    }
    return send(res, 404, "not found", { "content-type": "text/plain" });
  };

  const servers = ROLES.map((role, i) => http.createServer((req, res) => void handler(role)(req, res)).listen(basePort === 0 ? 0 : basePort + i, HOST));
  await Promise.all(servers.map((s) => new Promise((resolve) => s.once("listening", resolve))));
  ROLES.forEach((role, i) => {
    const address = servers[i]?.address();
    if (address === null || address === undefined || typeof address === "string") throw new Error("server has no port");
    origins[role] = `http://${HOST}:${address.port}`;
  });

  return {
    origins,
    log: () => [...log],
    reset: () => {
      log.length = 0;
      counters.clear();
    },
    close: () => Promise.all(servers.map((s) => new Promise((resolve) => s.close(resolve)))).then(() => undefined),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origins } = await startFixtureServers(8801);
  process.stdout.write(`${JSON.stringify(origins, null, 2)}\n`);
}
