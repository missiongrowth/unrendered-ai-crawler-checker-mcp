import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";

const out = "dist";
await rm(out, { recursive: true, force: true });
await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content/index.ts",
    panel: "src/panel/main.tsx",
  },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome124",
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "warning",
});
const fonts = "node_modules/geist/dist/fonts";
await Promise.all([
  cp(`${fonts}/geist-sans/Geist-Variable.woff2`, `${out}/fonts/Geist-Variable.woff2`),
  cp(`${fonts}/geist-mono/GeistMono-Variable.woff2`, `${out}/fonts/GeistMono-Variable.woff2`),
  // The SIL Open Font License requires the licence to travel with the fonts.
  cp("node_modules/geist/LICENSE.txt", `${out}/fonts/OFL.txt`),
  cp("src/manifest.json", `${out}/manifest.json`),
  cp("src/panel/index.html", `${out}/panel.html`),
  cp("src/panel/panel.css", `${out}/panel.css`),
]);
