// Renders src/icons/*.svg to the PNG sizes the manifest lists. Run after editing an SVG.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  const svg = await readFile(`src/icons/${size === 16 ? "icon-16" : "icon"}.svg`, "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `src/icons/icon-${size}.png`, omitBackground: true });
}
await browser.close();
