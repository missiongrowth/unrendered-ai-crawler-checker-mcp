export type BotClass = "training" | "search" | "user-fetch" | "control-token";

export interface Bot {
  /** robots.txt product token. */
  token: string;
  vendor: string;
  /** Verbatim from the vendor page or from verified traffic (see `userAgentSeen`); null when not probed. */
  userAgent: string | null;
  /** Set when the vendor publishes a token only and the string comes from requests made from the vendor's published IP ranges. */
  userAgentSeen?: { date: string; ipList: string };
  docUrl: string;
  class: BotClass;
  /** Verbatim vendor sentence on robots.txt, when the page has one for this token. */
  robotsNote: string | null;
  /** Whether the bot executes JavaScript per RENDER_STUDY; null when the study did not measure it. */
  rendersJs: boolean | null;
}

/** The only published measurement of AI crawler JavaScript execution; no vendor states it. */
export const RENDER_STUDY = {
  title: "The rise of the AI crawler",
  publisher: "Vercel and MERJ",
  date: "2024-12-17",
  url: "https://vercel.com/blog/the-rise-of-the-ai-crawler",
  quote: "The results consistently show that none of the major AI crawlers currently render JavaScript.",
} as const;

/** Date every row was last read on its vendor page. */
export const BOTS_CHECKED = "2026-10-01";

const OPENAI = "https://developers.openai.com/api/docs/bots";
const ANTHROPIC = "https://support.claude.com/en/articles/8896518";
/** Seen on missiongrowth.io from 216.73.216.0/22 and 34.162.191.81, both in Anthropic's published list. */
const ANTHROPIC_SEEN = { date: "2026-10-01", ipList: "https://claude.com/crawling/bots.json" };
const ANTHROPIC_NOTE = "Anthropic’s Bots respect “do not crawl” signals by honoring industry standard directives in robots.txt.";
const PERPLEXITY = "https://docs.perplexity.ai/docs/resources/perplexity-crawlers";
const GOOGLE = "https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers";
const APPLE = "https://support.apple.com/en-us/119829";
const META = "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers";
const AMAZON = "https://developer.amazon.com/amazonbot";
const MISTRAL = "https://docs.mistral.ai/robots";

export const BOTS: readonly Bot[] = [
  {
    token: "GPTBot", vendor: "OpenAI", docUrl: OPENAI, class: "training",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot",
    robotsNote: "Disallowing GPTBot indicates a site’s content should not be used in training generative AI foundation models.",
    rendersJs: false,
  },
  {
    token: "OAI-SearchBot", vendor: "OpenAI", docUrl: OPENAI, class: "search",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot",
    robotsNote: "To help ensure your site appears in search results, we recommend allowing OAI-SearchBot in your site’s robots.txt file and allowing requests from our published IP ranges below.",
    rendersJs: false,
  },
  {
    token: "ChatGPT-User", vendor: "OpenAI", docUrl: OPENAI, class: "user-fetch",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot",
    robotsNote: "Because these actions are initiated by a user, robots.txt rules may not apply.",
    rendersJs: false,
  },
  { token: "ClaudeBot", vendor: "Anthropic", docUrl: ANTHROPIC, class: "training", userAgentSeen: ANTHROPIC_SEEN, userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", robotsNote: ANTHROPIC_NOTE, rendersJs: false },
  { token: "Claude-SearchBot", vendor: "Anthropic", docUrl: ANTHROPIC, class: "search", userAgent: null, robotsNote: ANTHROPIC_NOTE, rendersJs: null },
  { token: "Claude-User", vendor: "Anthropic", docUrl: ANTHROPIC, class: "user-fetch", userAgentSeen: ANTHROPIC_SEEN, userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +claude-user@anthropic.com)", robotsNote: ANTHROPIC_NOTE, rendersJs: null },
  {
    token: "PerplexityBot", vendor: "Perplexity", docUrl: PERPLEXITY, class: "search",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    robotsNote: "To ensure your site appears in search results, we recommend allowing PerplexityBot in your site’s robots.txt file and permitting requests from our published IP ranges listed below.",
    rendersJs: false,
  },
  {
    token: "Perplexity-User", vendor: "Perplexity", docUrl: PERPLEXITY, class: "user-fetch",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)",
    robotsNote: "Since a user requested the fetch, this fetcher generally ignores robots.txt rules.",
    rendersJs: null,
  },
  {
    token: "Googlebot", vendor: "Google", docUrl: GOOGLE, class: "search", userAgent: null,
    robotsNote: "Crawling preferences addressed to the Googlebot user agent affect Google Search (including Discover and all Google Search features), as well as other products such as Google Images, Google Video, Google News, and Discover.",
    rendersJs: true,
  },
  {
    token: "Google-Extended", vendor: "Google", docUrl: GOOGLE, class: "control-token", userAgent: null,
    robotsNote: "Google-Extended doesn't have a separate HTTP request user agent string. Crawling is done with existing Google user agent strings; the robots.txt user-agent token is used in a control capacity.",
    rendersJs: null,
  },
  {
    token: "Applebot", vendor: "Apple", docUrl: APPLE, class: "search", userAgent: null,
    robotsNote: "Applebot respects standard robots.txt directives in general search crawls that are targeted at Applebot.",
    rendersJs: true,
  },
  {
    token: "Applebot-Extended", vendor: "Apple", docUrl: APPLE, class: "control-token", userAgent: null,
    robotsNote: "Applebot-Extended does not crawl webpages. Webpages that disallow Applebot-Extended can still be included in search results. Applebot-Extended is only used to determine how to use the data crawled by the Applebot user agent.",
    rendersJs: null,
  },
  {
    token: "Meta-ExternalAgent", vendor: "Meta", docUrl: META, class: "training",
    userAgent: "meta-externalagent/1.1 (+/documentation/sharing/webmasters/web-crawlers)",
    robotsNote: "By configuring the robots.txt file on your website, you can specify to the Meta web crawlers how you would prefer them to interact with your site.",
    rendersJs: false,
  },
  {
    token: "Meta-ExternalFetcher", vendor: "Meta", docUrl: META, class: "user-fetch",
    userAgent: "meta-externalfetcher/1.1 (+/documentation/sharing/webmasters/web-crawlers)",
    robotsNote: "The Meta-ExternalFetcher crawler may bypass robots.txt because it performs fetches that were requested by the user.",
    rendersJs: null,
  },
  {
    token: "Amazonbot", vendor: "Amazon", docUrl: AMAZON, class: "training",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1) Chrome/W.X.Y.Z Safari/537.36",
    robotsNote: "Automated crawling from these listed user agents respects the Robots Exclusion Protocol, honoring the user-agent and the allow/disallow directives.",
    rendersJs: null,
  },
  {
    token: "Amzn-SearchBot", vendor: "Amazon", docUrl: AMAZON, class: "search",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-SearchBot/0.1) Chrome/W.X.Y.Z Safari/537.36",
    robotsNote: null,
    rendersJs: null,
  },
  {
    token: "Amzn-User", vendor: "Amazon", docUrl: AMAZON, class: "user-fetch",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-User/0.1) Chrome/W.X.Y.Z Safari/537.36",
    robotsNote: null,
    rendersJs: null,
  },
  {
    token: "MistralAI-User", vendor: "Mistral AI", docUrl: MISTRAL, class: "user-fetch",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)",
    robotsNote: "MistralAI-User governs which sites these user requests can be made to.",
    rendersJs: null,
  },
  {
    token: "MistralAI-Index", vendor: "Mistral AI", docUrl: MISTRAL, class: "search",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Index/1.0; +https://docs.mistral.ai/robots)",
    robotsNote: null,
    rendersJs: null,
  },
  {
    token: "MistralAI-Training", vendor: "Mistral AI", docUrl: MISTRAL, class: "training",
    userAgent: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-Training/1.0; +https://docs.mistral.ai/robots)",
    robotsNote: "Webmasters can disallow this user agent in their robots.txt file.",
    rendersJs: null,
  },
  {
    token: "DuckAssistBot", vendor: "DuckDuckGo", docUrl: "https://duckduckgo.com/duckduckgo-help-pages/results/duckassistbot", class: "user-fetch",
    userAgent: "DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)",
    robotsNote: "If you’re a publisher, you may opt out of being a potential source for AI-assisted answers by modifying the robots.txt file for your domain(s).",
    rendersJs: null,
  },
  {
    token: "CCBot", vendor: "Common Crawl", docUrl: "https://commoncrawl.org/ccbot", class: "training",
    userAgent: "CCBot/2.0 (https://commoncrawl.org/faq/)",
    robotsNote: "To prevent Common Crawl from crawling your website, include the following in your robots.txt: User-agent: CCBot Disallow: /",
    rendersJs: null,
  },
];
