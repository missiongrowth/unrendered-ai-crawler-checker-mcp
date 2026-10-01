import { defineConfig } from "vitest/config";

// test/e2e holds Playwright specs, which Vitest must not collect.
export default defineConfig({ test: { include: ["test/unit/**/*.test.ts"] } });
