# Unrendered: AI Crawler Checker plugin

Check which page content AI crawlers like GPTBot and ClaudeBot can't read. Most AI crawlers don't run JavaScript, so they only see the raw HTML. This plugin compares the raw HTML with the rendered page and shows what robots.txt and the server allow for each AI bot.

It adds the [unrendered-mcp](https://www.npmjs.com/package/unrendered-mcp) server and a skill that tells the assistant when and how to use it. Made by [Mission Growth](https://missiongrowth.io). More about the tool and the Chrome extension: [missiongrowth.io/tools/unrendered](https://missiongrowth.io/tools/unrendered).

## Requirements

- Node 20 or later
- Google Chrome. The server runs the checks in your installed Chrome and downloads no browser.

## Install

Claude Code:

```sh
claude plugin marketplace add missiongrowth/unrendered-ai-crawler-checker-mcp
claude plugin install unrendered@unrendered
```

Cursor: install Unrendered from the Cursor Marketplace, or copy this folder to `~/.cursor/plugins/local/unrendered`.

## Use

Ask in plain words, for example:

- "Can AI crawlers read https://example.com/pricing?"
- "Check these 20 URLs for content that only appears after JavaScript."
- "Which AI bots does robots.txt block on this site?"

## Tools

- `analyze_page({ url })`: share of main content present in the raw HTML, text blocks that only exist after JavaScript, and differences in title, meta description, canonical, robots meta and JSON-LD.
- `check_ai_bots({ url })`: robots.txt verdict per AI bot with the matching rule, and how the server answers each bot's user-agent.

Full tool reference: [mcp/README.md](../mcp/README.md).

## Privacy

Everything runs on your machine. The plugin sends requests only to the site you check. No analytics, no telemetry, no accounts. Privacy policy: [missiongrowth.io/tools/unrendered/privacy](https://missiongrowth.io/tools/unrendered/privacy).

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
