import type { Page } from "@playwright/test";
import { BOTS } from "../../src/data/bots";
import { MIXED_DISALLOWED, MIXED_VERDICTS } from "../fixtures/cases";
import { analyse, expect, openTab, test, type Extension } from "./harness";

interface BotRowState {
  token: string;
  verdict: string;
  robots: string;
}

const readBots = (panel: Page): Promise<BotRowState[]> =>
  panel.evaluate(() =>
    [...document.querySelectorAll("[data-bot]")].map((el) => ({
      token: el.getAttribute("data-bot") ?? "",
      verdict: el.getAttribute("data-verdict") ?? "",
      robots: el.getAttribute("data-robots") ?? "",
    })),
  );

/**
 * Permission handling: `extWithHosts` is dist with `http://*` granted at install instead of optional,
 * so `chrome.permissions.request({ origins })` resolves true with no native prompt (automation cannot
 * click it). The unmodified dist is used by every other spec, so the activeTab-only flow stays covered.
 */
async function runBotCheck(ext: Extension, url: string): Promise<BotRowState[]> {
  const page = await ext.ctx.newPage();
  await page.goto(url);
  await page.waitForLoadState("load");
  const { panel, status } = await analyse(ext, page);
  expect(status).toBe("ready");
  await openTab(panel, "Bots");
  await panel.getByRole("button", { name: "Check bots" }).click();
  await expect
    .poll(async () => {
      const rows = await readBots(panel);
      return rows.length === BOTS.length && rows.every((r) => r.verdict !== "");
    }, { timeout: 45_000 })
    .toBe(true);
  return readBots(panel);
}

const byToken = (rows: BotRowState[]) => new Map(rows.map((r) => [r.token, r]));

test("bot check on /ua/mixed: verdicts, robots rows, user-agent and client hints on the wire", async ({ extWithHosts: ext, servers }) => {
  const origin = servers.origins.main;
  await ext.ctx.addCookies([{ name: "sid", value: "member", url: origin }]);

  const probe = await ext.ctx.newPage();
  await probe.goto(`${origin}/p/ssr-article`);
  const echoed = await probe.evaluate(async () => (await (await fetch("/echo")).json()) as { headers: Record<string, string> });
  expect(Object.keys(echoed.headers), "a normal browser request carries client hints in this Chromium").toContain("sec-ch-ua");
  await probe.close();

  servers.reset();
  const rows = byToken(await runBotCheck(ext, `${origin}/ua/mixed`));

  for (const bot of BOTS) {
    const row = rows.get(bot.token);
    expect(row, bot.token).toBeDefined();
    const wanted = bot.userAgent === null ? "not-probed" : (MIXED_VERDICTS[bot.token] ?? "missing from MIXED_VERDICTS");
    expect(row?.verdict, `${bot.token} verdict`).toBe(wanted);
    expect(row?.robots, `${bot.token} robots`).toBe(MIXED_DISALLOWED.includes(bot.token) ? "disallowed" : "allowed");
  }

  const log = servers.log();
  const botAgents = new Set(BOTS.flatMap((b) => (b.userAgent === null ? [] : [b.userAgent])));
  for (const bot of BOTS) {
    if (bot.userAgent === null) continue;
    const seen = log.filter((e) => e.path === "/ua/mixed" && e.headers["user-agent"] === bot.userAgent);
    expect(seen.length, `${bot.token}: a request carried exactly the registry user-agent`).toBeGreaterThan(0);
  }
  const asBot = log.filter((e) => botAgents.has(String(e.headers["user-agent"])));
  expect(asBot.length).toBeGreaterThan(0);
  for (const entry of asBot) {
    expect(Object.keys(entry.headers).filter((k) => k.startsWith("sec-ch-ua")), `client hints on ${entry.path}`).toEqual([]);
    expect(entry.headers["cookie"], `cookie on ${entry.path}`).toBeUndefined();
  }
  const controls = log.filter((e) => e.path === "/ua/mixed" && !botAgents.has(String(e.headers["user-agent"])));
  expect(controls.length, "controls use the browser's own user-agent").toBeGreaterThanOrEqual(2);
});

const ROBOTS_ORIGINS = [
  { origin: "robots500", disallowed: "all" },
  { origin: "robots404", disallowed: "none" },
  { origin: "robotsRedirect", disallowed: "GPTBot" },
] as const;

for (const { origin, disallowed } of ROBOTS_ORIGINS) {
  test(`bot check: robots.txt behaviour on ${origin}`, async ({ extWithHosts: ext, servers }) => {
    const rows = await runBotCheck(ext, `${servers.origins[origin]}/ua/echo`);
    for (const row of rows) {
      const want = disallowed === "all" || row.token === disallowed ? "disallowed" : "allowed";
      expect(row.robots, row.token).toBe(want);
    }
    if (origin === "robots500") return;
    for (const bot of BOTS) {
      if (bot.userAgent !== null) expect(byToken(rows).get(bot.token)?.verdict, `${bot.token} verdict`).toBe("same");
    }
  });
}
