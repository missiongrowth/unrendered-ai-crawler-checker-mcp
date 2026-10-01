// The repo ships no @types/node and tsconfig pins `types` to chrome; these are the only Node APIs the e2e harness uses.
declare module "node:child_process" {
  export function execFileSync(file: string, args: readonly string[], options: { cwd: string; stdio: "inherit" }): void;
}
declare module "node:fs" {
  export function cpSync(source: string, destination: string, options: { recursive: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}
declare module "node:os" {
  export function tmpdir(): string;
}
declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
}
declare const process: { execPath: string };
interface ImportMeta {
  readonly dirname: string;
}
