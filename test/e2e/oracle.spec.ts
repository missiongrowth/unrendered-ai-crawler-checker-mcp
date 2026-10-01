import type { Browser, Page } from "@playwright/test";
import { CONFIG } from "../../src/config";
import { CASES, type FixtureCase } from "../fixtures/cases";
import { analyse, expect, openPanel, openTab, readBlockRows, readTexts, test, waitSettled, type PanelRow } from "./harness";
import {
  blockTexts,
  collectBlocks,
  collectHead,
  diffStates,
  expectedFieldStates,
  expectedStates,
  extremeCoverage,
  groupRows,
  type HeadFacts,
  type PageSnapshot,
} from "./oracle-lib";

const PERCENT = /\d+%/;

/** The removed list shows tokens, not the original text: compare lower-cased words. */
const wordsOf = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

interface FieldRow {
  field: string;
  state: string;
}

/** The pair of loads the oracle compares: JavaScript off (what the server sent) and on (the tab the extension analyses). */
async function loadOff(
  browser: Browser,
  c: FixtureCase,
  origin: string,
): Promise<{ snapshot: PageSnapshot; head: HeadFacts }> {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    await ctx.addCookies((c.cookies ?? []).map((k) => ({ ...k, url: origin })));
    const page = await ctx.newPage();
    await page.goto(origin + (c.offGoto ?? c.goto));
    return { snapshot: await collectBlocks(page), head: await collectHead(page) };
  } finally {
    await ctx.close();
  }
}

async function readFieldRows(panel: Page): Promise<FieldRow[]> {
  return panel.evaluate(() =>
    [...document.querySelectorAll("[data-field]")].map((el) => ({
      field: el.getAttribute("data-field") ?? "",
      state: el.getAttribute("data-field-state") ?? "",
    })),
  );
}

for (const c of CASES) {
  test(`oracle: ${c.name}`, async ({ ext, servers, browser }) => {
    const origin = servers.origins.main;
    const off = await loadOff(browser, c, origin);
    servers.reset();

    await ext.ctx.addCookies((c.cookies ?? []).map((k) => ({ ...k, url: origin })));
    const page = await ext.ctx.newPage();
    await page.goto(origin + c.goto);
    await page.waitForLoadState("load");
    if (c.settledPath !== undefined) await page.waitForURL(`**${c.settledPath}`);
    await page.waitForTimeout(800);
    const on = await collectBlocks(page);
    const onHead = await collectHead(page);

    const { panel, status } = await analyse(ext, page);
    expect(status).toBe("ready");

    const expected = expectedStates(blockTexts(on), blockTexts(off.snapshot), c.annotations ?? []);
    for (const extra of c.extra ?? []) expected.set(extra.text, extra.states);
    const rows: PanelRow[] = await readBlockRows(panel);
    expect(rows.length, "the panel lists blocks").toBeGreaterThan(0);
    const { groups, orphans } = groupRows(rows, expected.keys());
    expect(
      orphans.map((r) => r.text),
      "rows the oracle cannot account for",
    ).toEqual([]);
    for (const { text, alternatives } of c.annotations ?? []) {
      const actual = (groups.get(text) ?? []).map((r) => r.state).sort();
      const accepted = alternatives?.find((alt) => alt.length === actual.length && [...alt].sort().every((st, i) => st === actual[i]));
      if (accepted) expected.set(text, accepted);
    }
    expect(diffStates(expected, groups)).toEqual([]);

    for (const scope of ["main", "all"] as const) {
      const text = (await panel.locator(`[data-metric="${scope}"]`).first().textContent()) ?? "";
      expect(text, `${scope} metric`).toMatch(PERCENT);
      const extreme = c.extra === undefined ? extremeCoverage(on, expected, scope) : null;
      if (extreme !== null) expect(PERCENT.exec(text)?.[0], `${scope} coverage`).toBe(extreme);
    }
    if (on.blocks.some((b) => b.hidden)) {
      await expect(panel.locator('[data-metric="hidden"]').first()).toHaveText(PERCENT);
    }

    if (c.dynamic !== true) {
      const onTexts = blockTexts(on);
      const expectedRemoved = blockTexts(off.snapshot).filter((o) => !onTexts.some((t) => t.includes(o)));
      const shown = (await readTexts(panel, "[data-removed]")).map(wordsOf).sort();
      expect(shown).toEqual(expectedRemoved.map(wordsOf).sort());
    }

    if (c.fields === true) {
      await openTab(panel, "Fields");
      const actual = await readFieldRows(panel);
      for (const [field, state] of expectedFieldStates(off.head, onHead)) {
        const row = actual.find((r) => r.field === field);
        // The panel may fold unchanged fields away; a differing field must always be listed.
        if ((state === "absent" || state === "same") && row === undefined) continue;
        expect(row?.state, `field ${field}`).toBe(state);
      }
    }
  });
}

test("perf: 5000 blocks analysed within the budget", async ({ ext, servers }) => {
  test.slow();
  const page = await ext.ctx.newPage();
  await page.goto(`${servers.origins.main}/p/big`);
  await page.waitForLoadState("load");
  const { panel, status } = await analyse(ext, page, 60_000);
  expect(status).toBe("ready");
  expect(await panel.locator('[data-metric="main"]').first().textContent()).toMatch(/100%/);
  // Milliseconds since the panel document started loading; the quiet window is part of every analysis,
  // the budget (PLAN §10) covers the work after it.
  const sincePanelLoad = await panel.evaluate(() => performance.now());
  expect(sincePanelLoad - CONFIG.settleQuietMs, `ready ${Math.round(sincePanelLoad)} ms after the panel loaded`).toBeLessThan(1500);
});

test("states: no text in the main content is said once, with nothing to share", async ({ ext, servers }) => {
  const page = await ext.ctx.newPage();
  await page.goto(`${servers.origins.main}/p/no-main-text`);
  await page.waitForLoadState("load");
  const { panel, status } = await analyse(ext, page);
  expect(status).toBe("ready");
  await expect(panel.locator(".hero")).toHaveText("No textThe main content has no visible text, so there is nothing to compare.");
  await expect(panel.locator('[data-metric="hidden"]')).toHaveText("None");
  await openTab(panel, "Share");
  await expect(panel.getByText("The main content has no visible text, so there is nothing to compare.").filter({ visible: true })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "Create image" })).toHaveCount(0);
});

const GATES = { "gate-status": "http-status", "gate-challenge": "challenge", "gate-redirect": "different-url" } as const;

for (const [path, kind] of Object.entries(GATES)) {
  test(`states: gate ${kind} shows the reason and no percentage`, async ({ ext, servers }) => {
    const page = await ext.ctx.newPage();
    await page.goto(`${servers.origins.main}/p/${path}`);
    await page.waitForLoadState("load");
    const { panel, status } = await analyse(ext, page);
    expect(status).toBe("gate");
    await expect(panel.locator("[data-gate]").first()).toHaveAttribute("data-gate", kind);
    await expect(panel.locator("[data-metric]")).toHaveCount(0);
  });
}

test("states: a page without a host grant is never analysed", async ({ ext }) => {
  const page = await ext.ctx.newPage();
  await page.goto("about:blank");
  const panel = await openPanel(ext, page);
  // Without activeTab for the tab the panel cannot read the URL, so "no-access" is as correct as "unsupported".
  expect(["unsupported", "no-access"]).toContain(await waitSettled(panel));
});
