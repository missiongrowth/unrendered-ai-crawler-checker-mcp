# Unrendered

A Chrome extension that compares a page's raw HTML with its rendered HTML, so you can see what AI crawlers that don't run JavaScript can read.

Click the icon on any page. The side panel shows how much of the main content is already in the raw HTML, and marks on the page which text appears only after JavaScript runs.

## Why

Vercel and MERJ measured AI crawler traffic in December 2024 and found that "none of the major AI crawlers currently render JavaScript" ([The rise of the AI crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler)). Text that JavaScript adds is invisible to them.

## What it shows

**Content.** The share of the main content that is in the raw HTML, and every text block with its state:

| State | Meaning |
| --- | --- |
| In raw HTML | This text is in the raw HTML. |
| Partly | Part of this text is in the raw HTML. JavaScript adds or changes the rest. |
| Repeated or moved | The same text is in the raw HTML, but not at this position. |
| Varies per request | Only one of two raw HTML requests had this text. |
| Only in JSON-LD | In the raw HTML this text exists only inside JSON-LD structured data. |
| Only in hydration data | In the raw HTML this text exists only inside framework data, such as `__NEXT_DATA__` or the RSC payload. |
| Only in rendered HTML | This text appears only after JavaScript runs. |

"Show on page" outlines each block on the page in its state's colour. Text that is in the raw HTML but gone from the rendered page is listed as "Only in raw HTML".

**Fields.** Title, meta description, canonical, hreflang, `html lang`, robots meta tags and JSON-LD, in the raw HTML and in the rendered HTML. It warns when the raw HTML says `noindex` and JavaScript removes it. It also lists links that exist only in the rendered HTML.

**Bots.** For 22 AI bot tokens: what robots.txt allows, and how the site answers a request with each bot's user-agent (same page, different page, challenge page, blocked, rate-limited or redirected). 17 are tested. Googlebot and Applebot run JavaScript and are not imitated. Google-Extended and Applebot-Extended never fetch pages. Claude-SearchBot has no verified user-agent string yet.

**Share.** A 1200 × 630 image, a one-line summary and a Markdown report.

## How it measures

1. After the click, the extension waits until the page has made no DOM changes for 1 s, for at most 8 s. Then it splits the rendered page into text blocks.
2. The same tab fetches the URL again: twice without cookies, as a crawler would, and once with your cookies.
3. Each rendered block is matched, in order, against the blocks of the first raw response. The second raw response separates text that changes on every request. The response with cookies is used only to tell you when the raw HTML has more text with your cookies.
4. Main content is the page's `<main>` element. Without one, it is all text outside the header, navigation, sidebars, footer and dialogs. Hidden text is counted on its own and is not part of the percentages.

Text is compared as words, so symbols such as ⌘ are not counted.

## Limits

- The extension is not a crawler. Requests come from your browser and your IP. Sites that verify bots by IP may answer the real bot differently.
- When the raw HTML is not the page (an error status, a challenge page from Cloudflare, AWS WAF or DataDome, or a redirect), no percentage is shown.
- Text inside iframes is not included.
- Raw HTML over 5 MB is cut at 5 MB.
- The page is measured at one width. The side panel narrows it, which can change what is hidden.
- Chrome does not let extensions read its own pages, the Chrome Web Store or PDFs.

## Install from source

You need Chrome 124 or later, Node.js and pnpm.

```sh
pnpm install
pnpm build
```

Open `chrome://extensions`, turn on Developer mode, click "Load unpacked" and choose the `dist` folder.

`pnpm check` runs the type check, lint, unit tests, build and the Playwright tests. The Playwright tests need Chromium once: `pnpm exec playwright install chromium`.

## Privacy

No data collection, no analytics, no storage. See [PRIVACY.md](PRIVACY.md).

## Licence

The code is licensed under the [GNU Affero General Public License v3.0](LICENSE). The names "Unrendered" and "MissionGrowth" and their icons are not; see [TRADEMARK.md](TRADEMARK.md).

Made by [MissionGrowth](https://missiongrowth.io).
