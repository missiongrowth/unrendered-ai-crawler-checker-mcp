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
await Promise.all([
  cp("src/manifest.json", `${out}/manifest.json`),
  cp("src/panel/index.html", `${out}/panel.html`),
  cp("src/panel/panel.css", `${out}/panel.css`),
]);
