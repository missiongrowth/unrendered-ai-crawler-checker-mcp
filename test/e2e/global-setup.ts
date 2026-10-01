import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export default function globalSetup(): void {
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: resolve(import.meta.dirname, "../.."), stdio: "inherit" });
}
