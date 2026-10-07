---
paths:
  - "**/tracker_audit/**"
  - "**/scanners/**"
  - "**/*{scanner,scraper,crawler}*.{py,ts,js,mjs}"
---
# Browser automation / tracker scanning

- Playwright `chromium.launch` adds `--no-sandbox` unless `chromiumSandbox: true` is passed (coreBundle checks `!== true`), so any tool that loads untrusted or LLM-chosen URLs must pass it, and should refuse loopback/private/link-local hosts (resolve DNS first, recheck the final URL after redirects) unless explicitly opted in (2026-10, xray)
