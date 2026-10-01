import { analyse, expect, openTab, test } from "./harness";

const EXTENSION_OR_INERT = /^(chrome-extension|data|blob|about):/;

test("analysis sends no request to any origin but the analysed one", async ({ ext, servers }) => {
  const origin = servers.origins.main;
  const page = await ext.ctx.newPage();
  await page.goto(`${origin}/p/ssr-article`);
  await page.waitForLoadState("load");
  servers.reset();

  const { panel, status } = await analyse(ext, page);
  expect(status).toBe("ready");
  for (const tab of ["Fields", "Share", "Content"] as const) await openTab(panel, tab);
  await page.waitForTimeout(500);

  const foreign = ext.requests.filter((r) => !EXTENSION_OR_INERT.test(r.url) && !r.url.startsWith(`${origin}/`));
  expect(foreign, "requests outside the analysed origin").toEqual([]);
  expect(ext.requests.some((r) => r.url.startsWith(`${origin}/`) && !r.fromServiceWorker), "the analysis fetched the page").toBe(true);

  const ports = new Set(servers.log().map((e) => e.port));
  expect([...ports], "server-side view: only the analysed origin was contacted").toEqual([Number(new URL(origin).port)]);
});
