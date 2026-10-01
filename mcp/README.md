# unrendered-mcp

An MCP server that gives an AI assistant the analysis of the [Unrendered](https://missiongrowth.io/tools/unrendered) Chrome extension: what a crawler that does not run JavaScript receives (the raw HTML) compared with the page a browser renders.

It does not reimplement the analysis. The extension's own snapshot code (`src/content/snapshot.ts`), `analyze`, robots.txt parser and bot classifier are bundled and run unchanged, inside your installed Google Chrome.

## Install

Requires Node 20 or later and Google Chrome. No browser is downloaded.

```sh
npx -y unrendered-mcp
```

### Claude Code

```sh
claude mcp add unrendered -- npx -y unrendered-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "unrendered": {
      "command": "npx",
      "args": ["-y", "unrendered-mcp"]
    }
  }
}
```

If Chrome is missing the tools answer with an error that says so. `UNRENDERED_CHROME_CHANNEL` selects another Chromium channel (default `chrome`).

## Tools

### `analyze_page({ url })`

Loads the URL in a headless Chrome, takes the extension's snapshot in an isolated world of the page (as a content script does), runs `analyze`, and returns a compact JSON object:

- `coverage`: share of the main content (and of all visible text) whose words are present in the raw HTML, with word counts and the basis used (`main-landmark` or `outside-landmarks`)
- `main_content_words`: words found in the raw HTML, words found only in JSON-LD or hydration data, words only present after JavaScript
- `missing_from_raw_html`: the largest text blocks that exist only after JavaScript (truncated, capped at 15)
- `fields`: differences in title, meta description, canonical, hreflang, `html lang`, robots meta and JSON-LD (capped at 30 rows)
- `links_only_after_javascript`, `text_in_raw_html_removed_by_javascript`
- `gate`: when the raw request is a challenge page (Cloudflare, AWS WAF, DataDome), an HTTP error, a different URL or a failed fetch, no coverage is computed and the gate says why
- `not_checked`: what this run did not verify

### `check_ai_bots({ url })`

For every bot in the extension's list: the robots.txt verdict for the URL (with the matching rule and line), and what the server answers when requested with that bot's published user-agent (`same`, `different`, `blocked`, `challenged`, `rate-limited`, `redirected-elsewhere`, `error`), plus `noindex`. Bots with no verified user-agent string, Googlebot and Applebot (which the extension does not imitate) and control tokens such as Google-Extended get a robots.txt verdict only (`http: "not_probed"`).

## What runs where

- Everything runs on your machine. Chrome starts headless for each call and is closed afterwards.
- `analyze_page` loads the page in that Chrome. The page requests its own resources, and the raw HTML is requested three times from the page itself, as in the extension.
- `check_ai_bots` requests `/robots.txt` and the URL about 20 times from Node, sequentially, with Chrome's user-agent and with each bot's.
- The analysis code runs in a blank Chrome page, because it needs a browser DOM parser.

## Privacy

Nothing is sent anywhere except requests to the site you analyse (and to addresses it redirects to or loads resources from). No analytics, no telemetry, no accounts, nothing stored. Each call uses a fresh temporary Chrome profile that is discarded when it ends.

## Known differences from the extension

- Closed shadow roots cannot be reached without the extension API, so their text counts as absent from the rendered side.
- The browser is headless, 1280x720, `en-US`, without your logins or cookies; the user-agent is Chrome's without the `Headless` marker.
- `check_ai_bots` sends its requests from Node, not from the browser: the TLS fingerprint and some headers differ from Chrome's, and no cookies are sent (the extension also sends none for bot probes). The character-set fallback is `utf-8` because no rendered page is loaded to read `document.characterSet` from.

## Development

```sh
pnpm install
pnpm build       # bundles the page scripts and the server into dist/
pnpm typecheck
pnpm parity      # compares this server with the extension's panel on 20 URLs (build the extension in the repo root first)
```

## License

AGPL-3.0-only.
