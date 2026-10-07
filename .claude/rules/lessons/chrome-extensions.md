---
paths:
  - "**/manifest.json"
  - "**/background.{ts,js}"
  - "**/service-worker.{ts,js}"
  - "**/sidepanel/**"
  - "**/content/**/*.{ts,js}"
---
# Chrome extensions (MV3)

- `sidePanel.setPanelBehavior({openPanelOnActionClick:true})` grants no activeTab; listen to `action.onClicked` and call `sidePanel.open({tabId})` first (2026-10, xray)
- With activeTab granted via `action.onClicked`, `scripting.executeScript` works with no host permission and the grant survives same-origin navigation (2026-10, xray)
- CDP `Extensions.triggerAction` needs the `tab`-type target, not the page target (2026-10, xray)
- A content script's `fetch(location.href, {credentials:"omit", cache:"no-store"})` is not blocked by the page CSP (`connect-src 'none'`) and is not intercepted by the page's Service Worker, so it returns the true server HTML without any host permission; an extension service-worker fetch to the same origin fails CORS unless the origin is granted (2026-10, xray)
- A DNR session rule `modifyHeaders` user-agent with `tabIds:[chrome.tabs.TAB_ID_NONE]` + `requestDomains` changes only the extension's own SW fetches and survives same-host redirects (2026-10, xray)
- Matching main_frame/xhr for a whole origin in a UA-spoofing DNR rule leaks the spoofed UA into other tabs (Adobe's AI-visibility extension) (2026-10, xray)
- Chrome Web Store: the 128 px icon must be 96 px artwork with 16 px transparent padding (a mostly dark icon gets a subtle white glow), a 440x280 small promo tile is required, and the Data usage form must disclose data handled even when it never leaves the device (User Data FAQ Q3), so the privacy policy must name what is read rather than say "collects nothing" (2026-10, unrendered)
- A bot-cloaking check that compares a bot response against two control fetches gives false "different page" on live pages (2 of 5 runs on theguardian.com/food, 99-100% overlap): re-request a different result once with fresh controls and keep the second answer (2026-10, unrendered)
