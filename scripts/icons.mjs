// Renders src/icons/*.svg to the PNG sizes the manifest lists. Run after editing an SVG.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  const svg = await readFile(`src/icons/${size === 16 ? "icon-16" : "icon"}.svg`, "utf8");
  // Chrome Web Store: the 128 px icon is 96 px of artwork with 16 px of transparent padding per side,
  // and a mostly dark icon gets a subtle white outer glow for dark backgrounds.
  const art = size === 128 ? "width:96px;height:96px;margin:16px;filter:drop-shadow(0 0 2px rgb(255 255 255 / 0.35))" : `width:${size}px;height:${size}px`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{display:block;${art}}</style>${svg}`);
  await page.screenshot({ path: `src/icons/icon-${size}.png`, omitBackground: true });
}
await browser.close();
