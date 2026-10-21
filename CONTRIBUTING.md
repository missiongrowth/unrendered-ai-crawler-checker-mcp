# Contributing

Bug reports with a URL that reproduces them help most. Open an [issue](https://github.com/missiongrowth/unrendered-ai-crawler-checker-mcp/issues/new/choose) before a large pull request, so we can agree on the approach first.

## Setup

You need Chrome 124 or later, Node.js 20 or later and pnpm.

```sh
pnpm install
pnpm exec playwright install chromium
pnpm check
```

`pnpm check` runs the type check, lint, unit tests, build and the Playwright tests. A pull request should pass it.

The MCP server lives in `mcp/` and bundles the extension's own analysis code:

```sh
cd mcp
pnpm install
pnpm build
```

## Pull requests

- One change per pull request, with a test when behaviour changes. Playwright fixtures are in `test/fixtures/pages`.
- Panel copy is plain English: say what was measured, not what it means for rankings.
- A new bot needs a user-agent string from the vendor's own documentation or from server logs, with the source in the pull request.

By contributing you agree that your contribution is licensed under the [AGPL-3.0](LICENSE).
