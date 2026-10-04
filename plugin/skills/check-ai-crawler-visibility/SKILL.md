---
name: check-ai-crawler-visibility
description: Check whether AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others that don't run JavaScript) can read a page's content, and what robots.txt and the server allow for each AI bot. Use when the user asks if AI search or LLM crawlers can see a page, why a page is missing from AI answers, or to audit JavaScript rendering for AI crawlers across a list of URLs.
---

# Check AI crawler visibility

Most AI crawlers fetch the raw HTML and don't run JavaScript. Content that only appears after JavaScript runs is invisible to them. The `unrendered` MCP server measures this in the user's installed Google Chrome.

## Tools

- `analyze_page({ url })`: compares the raw HTML with the rendered page. Returns the share of main content present in the raw HTML, the largest text blocks that exist only after JavaScript, differences in title, meta description, canonical, robots meta and JSON-LD, and links that only exist after JavaScript.
- `check_ai_bots({ url })`: for each AI bot, the robots.txt verdict with the matching rule, and how the server answers that bot's user-agent (`same`, `different`, `blocked`, `challenged`, `rate-limited`, `redirected-elsewhere`, `error`).

## How to run a check

1. Call `analyze_page` for each URL. For a list, call it once per URL, one at a time.
2. If `gate` is set, report why no coverage was computed (challenge page, HTTP error, redirect or failed fetch). Don't treat that run as a result.
3. Call `check_ai_bots` when the user asks about access, blocking or robots.txt, or when coverage is high but the page still doesn't show up in AI answers.
4. Report per URL: coverage, the most important blocks missing from the raw HTML, field differences, and bots that are disallowed or answered differently.
5. Pass on each tool's `not_checked` list, so the user knows what the run did not verify.

## Limits to mention

- Requests come from the user's machine and IP. A site that verifies bots by IP may answer the real bot differently.
- Text inside iframes and closed shadow roots is not counted.
- The tools refuse private and loopback addresses unless `UNRENDERED_ALLOW_PRIVATE_HOSTS=1` is set.
