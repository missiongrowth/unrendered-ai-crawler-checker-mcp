import { build } from "esbuild";
import { chmod, copyFile, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });

const common = { bundle: true, logLevel: "warning", legalComments: "none", outdir: "dist" };

await build({
  ...common,
  entryPoints: { "page-snapshot": "src/page/snapshot-entry.ts", "page-core": "src/page/core-entry.ts" },
  format: "iife",
  target: "chrome124",
  platform: "browser",
});

await build({
  ...common,
  entryPoints: { server: "src/server.ts" },
  format: "esm",
  target: "node20",
  platform: "node",
  external: ["@modelcontextprotocol/sdk", "playwright-core", "zod"],
  banner: { js: "#!/usr/bin/env node" },
});
await chmod("dist/server.js", 0o755);
// page-core bundles the Apache-2.0 robots.txt parser; its notice travels with the package.
await copyFile("../THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
