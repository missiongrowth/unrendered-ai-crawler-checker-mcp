---
paths:
  - "**/vite.config.*"
  - "**/rollup.config.*"
  - "**/webpack.config.*"
  - "**/eslint.config.*"
  - "**/package.json"
  - "**/pnpm-workspace.yaml"
---
# Frontend build & perf

- pnpm 12's `minimumReleaseAge` rejects any package published within the last day (vitest 5.0.3, released the day before, failed the lockfile check); pin the previous release in package.json and rebuild the lockfile instead of relaxing the policy, and allow esbuild's postinstall with `allowBuilds: { esbuild: true }` in pnpm-workspace.yaml (2026-10, xray)
