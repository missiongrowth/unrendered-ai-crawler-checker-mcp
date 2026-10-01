# Unrendered privacy policy

Last updated: 2026-10-01

Unrendered is a Chrome extension made by MissionGrowth. It compares a page's raw HTML with its rendered HTML. Everything happens in your browser.

## What the extension does not do

- It collects no personal data and no browsing history.
- It sends nothing to MissionGrowth or to any other third party. There are no analytics, no telemetry and no accounts.
- It stores nothing. Results exist only while the side panel is open.

## Which requests it makes

Only when you ask for it, and only to the site you are analysing:

- **Analyse (toolbar icon):** the page you are viewing is requested again from its own server, twice without cookies and once with your cookies, so the raw HTML can be compared with what your browser rendered. The response never leaves your browser.
- **Check bots (Bots tab, after you allow access to the site):** the site's `/robots.txt` is requested, and the page is requested once with each listed AI bot's published user-agent and twice with your browser's own user-agent. When a bot gets a different page, its request and the two normal requests are sent once more. These requests are sent without cookies.

## Permissions

- `activeTab`: read the tab you clicked the icon on, and nothing else.
- `scripting`: run the comparison script in that tab.
- `sidePanel`: show the results next to the page.
- `declarativeNetRequestWithHostAccess`: set the user-agent on the extension's own bot-check requests. It never changes the requests of your pages.
- Optional site access: asked for one site at a time when you click "Check bots", because those requests go to the site from the extension.

## Contact

Questions: contact@missiongrowth.io
