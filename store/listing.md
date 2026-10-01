# Chrome Web Store listing

Fields of the developer dashboard, in its order. Paste the text between the lines as it is.

## Store listing

**Name** (from the manifest): Unrendered by Mission Growth

**Summary** (from the manifest, 132 characters at most): Compare a page's raw HTML with its rendered HTML to see what AI crawlers that don't run JavaScript can read.

**Category:** Developer Tools

**Language:** English

**Description:**

---

Compare a page's raw HTML with its rendered HTML, and see what AI crawlers that don't run JavaScript can read.

Vercel and MERJ measured AI crawler traffic in December 2024 and found that none of the major AI crawlers currently render JavaScript. Text that JavaScript adds is invisible to them. Unrendered shows you which text that is.

Click the icon on any page. The side panel shows:

Content
• How much of the main content is already in the raw HTML.
• Every text block, marked by where its text is, such as In raw HTML, Only in JSON-LD or Only in rendered HTML.
• Show on page: outlines each block on the page in its colour.

Fields
• Title, meta description, canonical, hreflang, robots meta tags and JSON-LD, raw against rendered.
• A warning when the raw HTML says noindex and JavaScript removes it.
• Links that exist only in the rendered HTML.

Bots
• What robots.txt allows for 22 AI bot tokens, with the matching line.
• How the site answers a request with each bot's user-agent: same page, different page, challenge page, blocked, rate-limited or redirected.

Share
• A 1200 × 630 image, a one-line summary and a Markdown report.

How it measures
After the page settles, the same tab fetches the URL again without cookies, as a crawler would, and matches each rendered text block, in order, against the raw HTML. A page that answers with an error, a redirect or a challenge page from Cloudflare, AWS WAF or DataDome gets no percentage, because the raw HTML is not the page.

Limits
The extension is not a crawler. Requests come from your browser and your IP, and sites that verify bots by IP may answer the real bot differently. Text inside iframes is not included.

Privacy
Nothing is sent to Mission Growth or anyone else. No analytics, no accounts, no storage.

Free and open source under the AGPL-3.0. Made by Mission Growth.

---

**Graphic assets**

- Store icon: `src/icons/icon-128.png` (96 px artwork, 16 px transparent padding)
- Screenshots, 1280 × 800, in this order: `screenshot-1-content-csr.png`, `screenshot-2-content-mixed.png`, `screenshot-3-fields.png`, `screenshot-4-bots.png`, `screenshot-5-share.png`
- Small promo tile, 440 × 280: `promo-small-440x280.png`

**Additional fields**

- Official URL / Homepage URL: the Unrendered page on missiongrowth.io, once it is live
- Support URL: the same page, or the GitHub issues page once the repository is public

## Privacy practices

**Single purpose:**

---

Compare the raw HTML of the page in the current tab with its rendered HTML, so the user can see which content appears only after JavaScript runs and is invisible to crawlers that don't run it.

---

**Permission justifications:**

activeTab

---

Reads the tab the user clicked the icon on, only after that click: a snapshot of its rendered text, and a capture of the visible tab when the user creates a share image.

---

scripting

---

Injects the content script into the clicked tab. It takes the snapshot of the rendered page, fetches the same URL again to get the raw HTML, and draws the optional outlines on the page.

---

sidePanel

---

Shows the results next to the page.

---

declarativeNetRequestWithHostAccess

---

Used only by the optional bot check. One session rule sets each AI bot's published user-agent, and removes client hints, on the extension's own requests to the analysed site. The rule is limited to requests that come from no tab, so it never changes a request made by a web page.

---

Host permissions (optional, http and https)

---

Requested at runtime for the analysed site only, when the user clicks "Check bots". The bot check sends its requests from the extension's service worker, which needs access to that host, and the user-agent rule needs host access to apply to them.

---

**Remote code:** No, I am not using remote code. All code is in the package.

**Data usage:**

- Collected (handled in the browser, never transmitted): Website content, Web history (the address of the tab the user analyses)
- Certify all three: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.

**Privacy policy URL:** the public copy of `PRIVACY.md` on missiongrowth.io, once it is live.
