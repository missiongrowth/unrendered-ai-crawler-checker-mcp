import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "mcp/dist", "node_modules", "notes", "test-results", "playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["mcp/scripts/**"],
    languageOptions: { globals: { console: "readonly", navigator: "readonly", process: "readonly", setTimeout: "readonly", URL: "readonly" } },
  },
  {
    files: ["scripts/**", "mcp/scripts/**", "test/**", "*.config.ts"],
    rules: { "no-console": "off" },
  },
);
