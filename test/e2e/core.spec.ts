import { build } from "esbuild";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import type { BlockState } from "../../src/core/align";
import type { Region } from "../../src/core/segment";
import type { ProbeReply, RawResponse } from "../../src/messages";

/** The DOM-dependent core modules, bundled as the extension bundles them and run inside Chromium. */
type Core = typeof import("./core-entry");

let bundle: string | undefined;

async function corePage(page: Page): Promise<Page> {
  bundle ??= (
    await build({
      entryPoints: [resolve(import.meta.dirname, "core-entry.ts")],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "core",
      target: "chrome124",
      logLevel: "silent",
    })
  ).outputFiles[0]?.text;
  if (bundle === undefined) throw new Error("esbuild produced no output");
  await page.goto("about:blank");
  await page.addScriptTag({ content: bundle });
  return page;
}

interface SegmentArgs {
  html: string;
  includeNoscript: boolean;
}

const segmentOf = (page: Page, args: SegmentArgs) =>
  page.evaluate(({ html, includeNoscript }: SegmentArgs) => {
    const core = (window as unknown as { core: Core }).core;
    const doc = Document.parseHTMLUnsafe(html);
    return core
      .segment(doc.body, { shadowRootOf: (el) => el.shadowRoot, includeNoscript })
      .map(({ tag, text, region }) => ({ tag, text, region }));
  }, args);

test.describe("segment", () => {
  test("splits block elements, joins inline text, assigns the nearest landmark", async ({ page }) => {
    await corePage(page);
    const html =
      "<body><header><h1>Site title</h1></header><nav><ul><li>Home</li><li>Docs</li></ul></nav>" +
      "<main><h1>Heading</h1><p>Hello <em>big</em> <b>world</b></p><ul><li>One</li><li>Two</li></ul></main>" +
      "<footer><p>Footer text</p></footer></body>";
    expect(await segmentOf(page, { html, includeNoscript: false })).toEqual([
      { tag: "h1", text: "Site title", region: "header" },
      { tag: "li", text: "Home", region: "nav" },
      { tag: "li", text: "Docs", region: "nav" },
      { tag: "h1", text: "Heading", region: "main" },
      { tag: "p", text: "Hello big world", region: "main" },
      { tag: "li", text: "One", region: "main" },
      { tag: "li", text: "Two", region: "main" },
      { tag: "p", text: "Footer text", region: "footer" },
    ]);
  });

  test("skips script, style, template, svg and iframe; noscript only when asked", async ({ page }) => {
    await corePage(page);
    const html =
      '<body><p>Visible</p><script>var x = "no"</script><style>p{color:red}</style><template><p>tpl</p></template>' +
      "<svg><text>svgtext</text></svg><noscript><p>Fallback text</p></noscript><iframe>inner</iframe><p>a<br>b</p></body>";
    expect(await segmentOf(page, { html, includeNoscript: false })).toEqual([
      { tag: "p", text: "Visible", region: "other" },
      { tag: "p", text: "a b", region: "other" },
    ]);
    expect(await segmentOf(page, { html, includeNoscript: true })).toEqual([
      { tag: "p", text: "Visible", region: "other" },
      { tag: "p", text: "Fallback text", region: "other" },
      { tag: "p", text: "a b", region: "other" },
    ]);
  });

  test("collapses whitespace including non-breaking spaces", async ({ page }) => {
    await corePage(page);
    const html = '<body><p>  Spaced\n   text <a href="#">link</a>,<br>after&nbsp;nbsp </p></body>';
    expect(await segmentOf(page, { html, includeNoscript: false })).toEqual([{ tag: "p", text: "Spaced text link, after nbsp", region: "other" }]);
  });

  test("dialog landmarks by role, aria-modal and tag", async ({ page }) => {
    await corePage(page);
    const html =
      '<body><div role="dialog"><p>Dialog one</p></div><div aria-modal="true"><p>Modal two</p></div>' +
      '<div role="main"><p>Role main</p></div><section><p>Plain</p></section></body>';
    const regions = (await segmentOf(page, { html, includeNoscript: false })).map((s) => [s.text, s.region]);
    expect(regions).toEqual([
      ["Dialog one", "dialog"],
      ["Modal two", "dialog"],
      ["Role main", "main"],
      ["Plain", "other"],
    ]);
  });

  test("declarative shadow root: slotted text is counted once, in flattened order", async ({ page }) => {
    await corePage(page);
    const html =
      '<body><div id="h"><template shadowrootmode="open"><p>Inside <slot></slot> shadow</p></template><span>slotted</span></div><p>After</p></body>';
    expect(await segmentOf(page, { html, includeNoscript: false })).toEqual([
      { tag: "p", text: "Inside slotted shadow", region: "other" },
      { tag: "p", text: "After", region: "other" },
    ]);
  });

  test("closed shadow root is read only through the shadowRootOf callback", async ({ page }) => {
    await corePage(page);
    const result = await page.evaluate(() => {
      const core = (window as unknown as { core: Core }).core;
      document.body.innerHTML = '<div id="h"><p>light</p></div>';
      const host = document.getElementById("h");
      if (host === null) throw new Error("no host");
      const root = host.attachShadow({ mode: "closed" });
      root.innerHTML = "<p>closed shadow text</p>";
      const texts = (shadowRootOf: (el: Element) => ShadowRoot | null) =>
        core.segment(document.body, { shadowRootOf, includeNoscript: false }).map((s) => s.text);
      return { open: texts((el) => el.shadowRoot), chrome: texts((el) => (el === host ? root : null)) };
    });
    expect(result).toEqual({ open: ["light"], chrome: ["closed shadow text"] });
  });
});

test.describe("scriptData", () => {
  test("collects JSON-LD and framework hydration strings, ignores i18n dictionaries", async ({ page }) => {
    await corePage(page);
    const html = String.raw`<html><head>
<script id="__NEXT_DATA__" type="application/json">{"props":{"title":"Next title","list":["a one","b two"],"n":5}}</script>
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
<script>self.__next_f.push([1,"3:T10,Flight text row\n4:[\"$\",\"div\",null,{\"children\":\"Flight child\"}]"])</script>
<script type="application/ld+json">{"@type":"Product","name":"Ld name","offers":{"price":"9.99"}}</script>
<script type="application/ld+json">{broken</script>
<script id="i18n" type="application/json">{"k":"Dictionary words"}</script>
<script>window.dict = {"x":"Inline dictionary"}</script>
</head><body></body></html>`;
    const data = await page.evaluate((h) => {
      const core = (window as unknown as { core: Core }).core;
      return core.scriptData(Document.parseHTMLUnsafe(h));
    }, html);
    expect(data).toEqual({
      structured: ["Product", "Ld name", "9.99"],
      hydration: ["Next title", "a one", "b two", "Flight text row", "$", "div", "Flight child"],
      unparsed: 1,
    });
  });
});

test.describe("readFields", () => {
  test("reads head facts, resolves URLs against base, strips fragments", async ({ page }) => {
    await corePage(page);
    const html =
      '<html lang="en-GB"><head><base href="https://cdn.example.com/base/"><title>  Spaced\n Title </title>' +
      '<meta name="description" content=" Desc   here "><link rel="canonical" href="page#frag">' +
      '<link rel="alternate" hreflang="DE" href="/de/"><link rel="Alternate" hreflang="fr" href="fr/">' +
      '<meta name="robots" content="noindex, nofollow"><meta name="GPTBot" content="noindex"><meta name="other" content="x">' +
      '<script type="application/ld+json">{"@type":"Product","name":"Kettle","offers":{"price":"9.5","priceCurrency":"EUR"}}</script>' +
      '<script type="application/ld+json">{bad</script></head><body><a href="x/y">one</a>' +
      '<a href="/abs" rel="nofollow noopener">two</a><a href="mailto:a@b.c">mail</a><a href="x/y#h">dup</a></body></html>';
    const fields = await page.evaluate((h) => {
      const core = (window as unknown as { core: Core }).core;
      return core.readFields(Document.parseHTMLUnsafe(h), "https://example.com/dir/page", ["GPTBot"]);
    }, html);
    expect(fields).toEqual({
      title: "Spaced Title",
      description: "Desc here",
      lang: "en-GB",
      canonical: ["https://cdn.example.com/base/page"],
      hreflang: ["de https://cdn.example.com/de/", "fr https://cdn.example.com/base/fr/"],
      robotsMeta: { robots: ["noindex, nofollow"], gptbot: ["noindex"] },
      links: ["https://cdn.example.com/base/x/y", "https://cdn.example.com/abs"],
      nofollowLinks: ["https://cdn.example.com/abs"],
      jsonLd: [{ key: "Product", type: "Product", props: { name: ["Kettle"], "offers.price": ["9.5"], "offers.priceCurrency": ["EUR"] } }],
      jsonLdInvalid: 1,
    });
  });
});

type RawSpec = { html: string; status?: number; url?: string; headers?: Record<string, string> } | { error: string };

interface AnalyzeArgs {
  url: string;
  first: RawSpec;
  second?: RawSpec;
  withCookies?: RawSpec;
  blocks: { tag: string; text: string; region: Region; hidden?: boolean }[];
  renderedHtml?: string;
}

const analyseIn = (page: Page, args: AnalyzeArgs) =>
  page.evaluate((a: AnalyzeArgs) => {
    const core = (window as unknown as { core: Core }).core;
    const raw = (spec: RawSpec): RawResponse =>
      "error" in spec
        ? { ok: false, error: spec.error }
        : {
            ok: true,
            status: spec.status ?? 200,
            url: spec.url ?? a.url,
            redirected: false,
            headers: spec.headers ?? { "content-type": "text/html" },
            html: spec.html,
            encoding: "utf-8",
            truncated: false,
          };
    const first = raw(a.first);
    const fields = core.readFields(Document.parseHTMLUnsafe(a.renderedHtml ?? "<html><head></head><body></body></html>"), a.url, []);
    return core.analyze(
      {
        url: a.url,
        characterSet: "UTF-8",
        viewportWidth: 800,
        settled: true,
        settleMs: 1000,
        translated: false,
        iframes: 0,
        blocks: a.blocks.map((b, id) => ({ id, tag: b.tag, text: b.text, region: b.region, hidden: b.hidden ?? false })),
        fields,
        raw: { first, second: a.second ? raw(a.second) : first, withCookies: a.withCookies ? raw(a.withCookies) : first },
      },
      [],
    );
  }, args);

const page_ = (body: string, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;
const states = (report: { ok: boolean; blocks?: { state: BlockState }[] }) => report.blocks?.map((b) => b.state);

test.describe("analyze", () => {
  const PAGE = "https://example.com/page";
  const p = (text: string): { tag: string; text: string; region: Region } => ({ tag: "p", text, region: "main" });

  test("classifies server, structured-data, hydration-data and js-added blocks; coverage in tokens", async ({ page }) => {
    await corePage(page);
    const head =
      '<script type="application/ld+json">{"@type":"Product","name":"Structured only product name here"}</script>' +
      '<script id="__NEXT_DATA__" type="application/json">{"headline":"Hydration only headline for the page"}</script>';
    const report = await analyseIn(page, {
      url: PAGE,
      first: { html: page_("<main><h1>Server heading text</h1><p>This paragraph is fully present in the server html document.</p></main>", head) },
      blocks: [
        { tag: "h1", text: "Server heading text", region: "main" },
        p("This paragraph is fully present in the server html document."),
        p("Structured only product name here"),
        p("Hydration only headline for the page"),
        p("Brand new client rendered sentence about quantum gardens"),
      ],
    });
    expect(states(report)).toEqual(["server", "server", "structured-data", "hydration-data", "js-added"]);
    if (!report.ok) throw new Error("gate failed");
    // 3 + 10 credited of 3 + 10 + 5 + 6 + 8 tokens.
    expect(report.main).toEqual({ credited: 13, total: 32 });
    expect(report.all).toEqual({ credited: 13, total: 32 });
    expect(report.removed).toEqual([]);
  });

  test("partial, ambiguous, volatile, hidden and removed", async ({ page }) => {
    await corePage(page);
    const promoRaw = "Free shipping on all orders over fifty euros";
    const promoRendered = `${promoRaw} for members this week only`;
    const volatile = "Offer today is the red bicycle bundle sale";
    const removed = "Old banner text that script removes later on";
    const report = await analyseIn(page, {
      url: PAGE,
      first: { html: page_(`<main><p>${promoRaw}</p><button>Add to cart</button><p>${removed}</p></main>`) },
      second: { html: page_(`<main><p>${promoRaw}</p><button>Add to cart</button><p>${removed}</p><p>${volatile}</p></main>`) },
      blocks: [
        p(promoRendered),
        { tag: "button", text: "Add to cart", region: "main" },
        { tag: "button", text: "Add to cart", region: "main" },
        p(volatile),
        { tag: "p", text: "Hidden extra paragraph written by script only", region: "main", hidden: true },
      ],
    });
    expect(states(report)).toEqual(["partial", "server", "ambiguous", "volatile", "js-added"]);
    if (!report.ok) throw new Error("gate failed");
    expect(report.blocks[0]).toMatchObject({ tokens: 13, credited: 8 });
    expect(report.removed).toEqual([removed.toLowerCase()]);
    expect(report.hidden).toEqual({ credited: 0, total: 7 });
    expect(report.main.total).toBe(13 + 3 + 3 + 8);
  });

  test("main coverage uses blocks outside landmarks when the page has no main", async ({ page }) => {
    await corePage(page);
    const report = await analyseIn(page, {
      url: PAGE,
      first: { html: page_("<header><p>Brand name header text</p></header><p>Body copy that the server sent for readers today.</p>") },
      blocks: [
        { tag: "p", text: "Brand name header text", region: "header" },
        { tag: "p", text: "Body copy that the server sent for readers today.", region: "other" },
        { tag: "p", text: "Written only by script after the page loaded successfully", region: "other" },
      ],
    });
    if (!report.ok) throw new Error("gate failed");
    expect(report.mainBasis).toBe("outside-landmarks");
    expect(report.main).toEqual({ credited: 9, total: 9 + 9 });
    expect(report.all.total).toBe(4 + 9 + 9);
  });

  test("gate: fetch error, non-2xx, challenge header, different final URL; fragment and trailing slash ignored", async ({ page }) => {
    await corePage(page);
    const blocks = [p("Some rendered paragraph with enough words inside")];
    const gateOf = async (first: RawSpec, url = PAGE) => {
      const report = await analyseIn(page, { url, first, blocks });
      return report.ok ? "ok" : report.gate.kind;
    };
    const html = page_("<main><p>Some rendered paragraph with enough words inside</p></main>");
    expect(await gateOf({ error: "Failed to fetch" })).toBe("fetch-failed");
    expect(await gateOf({ html, status: 403 })).toBe("http-status");
    expect(await gateOf({ html, headers: { "cf-mitigated": "challenge" } })).toBe("challenge");
    expect(await gateOf({ html, status: 403, headers: { "cf-mitigated": "challenge" } })).toBe("challenge");
    expect(await gateOf({ html, url: "https://example.com/elsewhere" })).toBe("different-url");
    expect(await gateOf({ html, url: "https://example.com/page/" }, "https://example.com/page#section")).toBe("ok");
  });

  test("cookie lift: reported when sending cookies raises coverage by at least 10 points, else null", async ({ page }) => {
    await corePage(page);
    const common = "<p>Plans and prices are listed below for every visitor of the shop.</p>";
    const greeting = "Welcome back, your saved plan is the Pro plan.";
    const other = (text: string) => ({ tag: "p", text, region: "other" as const });
    const blocks = [other("Plans and prices are listed below for every visitor of the shop."), other(greeting)];
    const lifted = await analyseIn(page, {
      url: PAGE,
      first: { html: page_(common) },
      withCookies: { html: page_(`${common}<p>${greeting}</p>`) },
      blocks,
    });
    if (!lifted.ok) throw new Error("gate failed");
    expect(lifted.cookieLift).toBeCloseTo(9 / 21, 5);
    const same = await analyseIn(page, { url: PAGE, first: { html: page_(common) }, withCookies: { html: page_(common) }, blocks });
    if (!same.ok) throw new Error("gate failed");
    expect(same.cookieLift).toBeNull();
  });

  test("field diffs: title and robots meta changed or added by script, canonical unchanged", async ({ page }) => {
    await corePage(page);
    const report = await analyseIn(page, {
      url: PAGE,
      first: { html: page_("<main><p>Some rendered paragraph with enough words inside</p></main>", '<title>Server title</title><link rel="canonical" href="/page">') },
      renderedHtml: page_("", '<title>Client title</title><link rel="canonical" href="/page"><meta name="robots" content="noindex">'),
      blocks: [p("Some rendered paragraph with enough words inside")],
    });
    if (!report.ok) throw new Error("gate failed");
    const byField = Object.fromEntries(report.fields.map((f) => [f.field, f.state]));
    expect(byField).toMatchObject({ Title: "changed", Canonical: "same", "meta robots": "added-by-js", "Meta description": "absent" });
  });
});

type Ok = Extract<RawResponse, { ok: true }>;

test.describe("botReport", () => {
  const PAGE_URL = "https://example.com/page";
  const html = (text: string, head = "") => `<html><head>${head}</head><body><main><p>${text}</p></main></body></html>`;
  const ok = (body: string, extra: Partial<Ok> = {}): RawResponse => ({
    ok: true,
    status: 200,
    url: PAGE_URL,
    redirected: false,
    headers: { "content-type": "text/html" },
    html: body,
    encoding: "utf-8",
    truncated: false,
    ...extra,
  });

  interface ReportArgs {
    reply: Extract<ProbeReply, { type: "probe-result" }>;
  }

  const reportFor = (page: Page, args: ReportArgs) =>
    page.evaluate(({ reply }: ReportArgs) => {
      const core = (window as unknown as { core: Core }).core;
      const report = core.botReport(reply, "https://example.com/page");
      return {
        controlSimilarity: report.controlSimilarity,
        contentSignals: report.contentSignals,
        tokens: report.rows.map((r) => r.bot.token),
        rows: report.rows.map((r) => ({
          token: r.bot.token,
          allowed: r.robots.allowed,
          kind: r.probe?.verdict.kind ?? "not-probed",
          noindex: r.probe?.noindex ?? false,
          detail: r.probe?.verdict.kind === "error" ? r.probe.verdict.detail : null,
        })),
      };
    }, args);

  const GARDEN = html("Garden planner for balcony tomatoes");
  const agentsWith = (responses: Record<string, RawResponse>) =>
    Object.entries(responses).map(([token, response]) => ({ token, response }));

  test("verdict order, per bot, with identical controls", async ({ page }) => {
    await corePage(page);
    const reply: ReportArgs["reply"] = {
      type: "probe-result",
      robots: { status: 200, body: "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nContent-Signal: ai-train=no\n" },
      controls: [ok(GARDEN), ok(GARDEN)],
      agents: agentsWith({
        GPTBot: ok("forbidden", { status: 403 }),
        "OAI-SearchBot": ok(html("Please wait", '<meta name="robots" content="noindex">'), { headers: { "cf-mitigated": "challenge" } }),
        "ChatGPT-User": ok(html("Access notice only")),
        PerplexityBot: ok("slow down", { status: 429 }),
        "Perplexity-User": ok(GARDEN, { url: "https://example.com/elsewhere" }),
        "Meta-ExternalAgent": ok(GARDEN, { headers: { "content-type": "text/html", "x-robots-tag": "noindex" } }),
        "Meta-ExternalFetcher": { ok: false, error: "boom" },
        Amazonbot: ok(html("Garden planner for balcony tomatoes", '<meta name="robots" content="noindex">')),
        "Amzn-SearchBot": ok(html("Garden planner for balcony tomatoes", '<meta name="amzn-searchbot" content="none">')),
        "Amzn-User": ok(GARDEN),
        "MistralAI-User": ok(GARDEN),
        "MistralAI-Index": ok(GARDEN),
        "MistralAI-Training": ok(GARDEN),
        DuckAssistBot: ok(GARDEN),
        CCBot: ok(GARDEN),
        ClaudeBot: ok(GARDEN),
        "Claude-User": ok(GARDEN),
      }),
    };
    const result = await reportFor(page, { reply });
    const core = await page.evaluate(() => (window as unknown as { core: Core }).core.BOTS.map((b) => b.token));
    expect(result.tokens, "one row per registry entry, in registry order").toEqual(core);
    expect(result.controlSimilarity).toBe(1);
    expect(result.contentSignals).toMatchObject([{ agents: ["*"], value: "ai-train=no" }]);
    const row = (token: string) => result.rows.find((r) => r.token === token);
    const expected: Record<string, [string, boolean?]> = {
      GPTBot: ["blocked"],
      "OAI-SearchBot": ["challenged", false],
      "ChatGPT-User": ["different"],
      PerplexityBot: ["rate-limited"],
      "Perplexity-User": ["redirected-elsewhere"],
      "Meta-ExternalAgent": ["same", true],
      "Meta-ExternalFetcher": ["error"],
      Amazonbot: ["same", true],
      "Amzn-SearchBot": ["same", true],
      "Amzn-User": ["same", false],
      CCBot: ["same", false],
      ClaudeBot: ["same", false],
      "Claude-SearchBot": ["not-probed"],
      Googlebot: ["not-probed"],
    };
    for (const [token, [kind, noindex]] of Object.entries(expected)) {
      expect(row(token)?.kind, token).toBe(kind);
      if (noindex !== undefined) expect(row(token)?.noindex, `${token} noindex`).toBe(noindex);
    }
    expect(row("Meta-ExternalFetcher")?.detail).toBe("boom");
    expect(row("GPTBot")?.allowed).toBe(false);
    expect(row("CCBot")?.allowed).toBe(true);
  });

  test("similarity threshold is the control-vs-control noise", async ({ page }) => {
    await corePage(page);
    const a = html("alpha beta gamma delta");
    const b = html("alpha beta gamma epsilon");
    // Controls share 3 of 5 tokens: 0.6.
    const reply: ReportArgs["reply"] = {
      type: "probe-result",
      robots: { status: 404, body: "" },
      controls: [ok(a), ok(b)],
      agents: agentsWith({
        GPTBot: ok(a),
        "OAI-SearchBot": ok(html("alpha beta zeta eta")),
        "ChatGPT-User": ok(html("alpha beta gamma epsilon delta")),
      }),
    };
    const { rows, controlSimilarity } = await reportFor(page, { reply });
    expect(controlSimilarity).toBeCloseTo(0.6, 5);
    const kind = (token: string) => rows.find((r) => r.token === token)?.kind;
    expect(kind("GPTBot")).toBe("same");
    expect(kind("OAI-SearchBot")).toBe("different");
    expect(kind("ChatGPT-User")).toBe("same");
  });

  test("one failed control: only an identical token set counts as same; both failed: error", async ({ page }) => {
    await corePage(page);
    const one = await reportFor(page, {
      reply: {
        type: "probe-result",
        robots: { status: 200, body: "" },
        controls: [ok(GARDEN), { ok: false, error: "net" }],
        agents: agentsWith({ GPTBot: ok(GARDEN), "OAI-SearchBot": ok(html("Garden planner for balcony")) }),
      },
    });
    expect(one.controlSimilarity).toBeNull();
    expect(one.rows.find((r) => r.token === "GPTBot")?.kind).toBe("same");
    expect(one.rows.find((r) => r.token === "OAI-SearchBot")?.kind).toBe("different");

    const none = await reportFor(page, {
      reply: {
        type: "probe-result",
        robots: { status: 200, body: "" },
        controls: [
          { ok: false, error: "net" },
          { ok: false, error: "net" },
        ],
        agents: agentsWith({ GPTBot: ok(GARDEN) }),
      },
    });
    expect(none.rows.find((r) => r.token === "GPTBot")?.kind).toBe("error");
  });

  test("robots.txt status rules: 5xx and unreachable disallow all, 4xx allows all", async ({ page }) => {
    await corePage(page);
    const allowedFor = async (robots: ReportArgs["reply"]["robots"]) => {
      const { rows } = await reportFor(page, { reply: { type: "probe-result", robots, controls: [ok(GARDEN), ok(GARDEN)], agents: [] } });
      return new Set(rows.map((r) => r.allowed));
    };
    expect([...(await allowedFor({ status: 500, body: "" }))]).toEqual([false]);
    expect([...(await allowedFor({ error: "net" }))]).toEqual([false]);
    expect([...(await allowedFor({ status: 404, body: "" }))]).toEqual([true]);
  });
});
