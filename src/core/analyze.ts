import { CONFIG } from "../config";
import type { RawResponse, Snapshot } from "../messages";
import { align, type BlockState } from "./align";
import { detectChallenge, type Challenge } from "./challenge";
import { scriptData } from "./data";
import { readFields, type JsonLdNode, type PageFields } from "./fields";
import { tokenize } from "./normalize";
import { segment, type Region } from "./segment";

export interface Coverage {
  /** Tokens credited as present in the server HTML. */
  credited: number;
  total: number;
}

export interface ClassifiedBlock {
  id: number;
  tag: string;
  text: string;
  region: Region;
  hidden: boolean;
  state: BlockState;
  tokens: number;
  credited: number;
}

export type FieldState = "same" | "changed" | "added-by-js" | "removed-by-js" | "absent";

export interface FieldDiff {
  field: string;
  state: FieldState;
  server: string[];
  rendered: string[];
}

export type GateFailure =
  | { kind: "fetch-failed"; detail: string }
  | { kind: "http-status"; status: number }
  | { kind: "challenge"; challenge: Challenge; status: number }
  | { kind: "different-url"; finalUrl: string };

export type Report =
  | { ok: false; url: string; gate: GateFailure }
  | {
      ok: true;
      url: string;
      status: number;
      blocks: ClassifiedBlock[];
      removed: string[];
      /** "main" when the page has a main landmark, otherwise text outside header/nav/aside/footer/dialogs. */
      mainBasis: "main-landmark" | "outside-landmarks";
      main: Coverage;
      all: Coverage;
      hidden: Coverage;
      /** Share of all-text coverage gained when the server request carries the user's cookies. */
      cookieLift: number | null;
      unparsedDataScripts: number;
      fields: FieldDiff[];
      jsOnlyLinks: string[];
      serverHeaders: Record<string, string>;
      serverHtml: string;
    };

const sameUrl = (a: string, b: string) => {
  const strip = (u: string) => {
    const url = new URL(u);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  };
  return strip(a) === strip(b);
};

function gate(url: string, raw: RawResponse): GateFailure | null {
  if (!raw.ok) return { kind: "fetch-failed", detail: raw.error };
  const challenge = detectChallenge(new Headers(raw.headers));
  if (challenge) return { kind: "challenge", challenge, status: raw.status };
  if (raw.status < 200 || raw.status > 299) return { kind: "http-status", status: raw.status };
  if (!sameUrl(url, raw.url)) return { kind: "different-url", finalUrl: raw.url };
  return null;
}

const parse = (html: string) => Document.parseHTMLUnsafe(html);

function rawBlocks(doc: Document): string[][] {
  return segment(doc.body, { shadowRootOf: (el) => el.shadowRoot, includeNoscript: true })
    .map((s) => tokenize(s.text))
    .filter((t) => t.length > 0);
}

const sum = (blocks: readonly ClassifiedBlock[]): Coverage =>
  blocks.reduce((c, b) => ({ credited: c.credited + b.credited, total: c.total + b.tokens }), { credited: 0, total: 0 });

const share = (c: Coverage) => (c.total === 0 ? 1 : c.credited / c.total);

function diffValues(field: string, server: string[], rendered: string[]): FieldDiff {
  const same = server.length === rendered.length && server.every((v, i) => v === rendered[i]);
  const state: FieldState =
    server.length === 0 && rendered.length === 0 ? "absent"
    : same ? "same"
    : server.length === 0 ? "added-by-js"
    : rendered.length === 0 ? "removed-by-js"
    : "changed";
  return { field, state, server, rendered };
}

const one = (v: string | null) => (v === null ? [] : [v]);

function jsonLdDiffs(server: JsonLdNode[], rendered: JsonLdNode[]): FieldDiff[] {
  const out: FieldDiff[] = [];
  const pairKey = (nodes: JsonLdNode[]) => {
    const seen = new Map<string, number>();
    return nodes.map((n) => {
      const k = seen.get(n.key) ?? 0;
      seen.set(n.key, k + 1);
      return `${n.key}#${k}`;
    });
  };
  const serverKeys = pairKey(server);
  const renderedKeys = pairKey(rendered);
  const byKey = new Map<string, { s?: JsonLdNode; r?: JsonLdNode }>();
  server.forEach((n, i) => byKey.set(serverKeys[i] ?? "", { s: n }));
  rendered.forEach((n, i) => {
    const k = renderedKeys[i] ?? "";
    byKey.set(k, { ...byKey.get(k), r: n });
  });
  for (const { s, r } of byKey.values()) {
    const type = (s ?? r)?.type ?? "";
    out.push(diffValues(`JSON-LD ${type}`, s ? ["present"] : [], r ? ["present"] : []));
    const paths = new Set([...Object.keys(s?.props ?? {}), ...Object.keys(r?.props ?? {})]);
    for (const p of paths) out.push(diffValues(`JSON-LD ${type} › ${p}`, s?.props[p] ?? [], r?.props[p] ?? []));
  }
  return out;
}

function fieldDiffs(server: PageFields, rendered: PageFields): FieldDiff[] {
  const out = [
    diffValues("Title", one(server.title), one(rendered.title)),
    diffValues("Meta description", one(server.description), one(rendered.description)),
    diffValues("Canonical", server.canonical, rendered.canonical),
    diffValues("hreflang", server.hreflang, rendered.hreflang),
    diffValues("html lang", one(server.lang), one(rendered.lang)),
  ];
  const metaNames = new Set([...Object.keys(server.robotsMeta), ...Object.keys(rendered.robotsMeta)]);
  for (const name of metaNames) out.push(diffValues(`meta ${name}`, server.robotsMeta[name] ?? [], rendered.robotsMeta[name] ?? []));
  if (server.jsonLdInvalid > 0 || rendered.jsonLdInvalid > 0) {
    out.push(diffValues("Invalid JSON-LD blocks", [String(server.jsonLdInvalid)], [String(rendered.jsonLdInvalid)]));
  }
  return [...out, ...jsonLdDiffs(server.jsonLd, rendered.jsonLd)];
}

export function analyze(snapshot: Snapshot, crawlerTokens: readonly string[]): Report {
  const { url, raw } = snapshot;
  const failure = gate(url, raw.first);
  if (failure || !raw.first.ok) return { ok: false, url, gate: failure ?? { kind: "fetch-failed", detail: "" } };

  const first = parse(raw.first.html);
  const second = raw.second.ok ? parse(raw.second.html) : first;
  const data = scriptData(first);
  const leaves = (strings: string[]) => strings.map(tokenize).filter((t) => t.length > 0);

  const rendered = snapshot.blocks.map((b) => ({ block: b, tokens: tokenize(b.text) })).filter((b) => b.tokens.length > 0);
  const renderedTokens = rendered.map((b) => b.tokens);
  const hidden = rendered.map((b) => b.block.hidden);
  const firstBlocks = rawBlocks(first);
  const { verdicts, removed } = align({
    rendered: renderedTokens,
    hidden,
    rawA: firstBlocks,
    rawB: rawBlocks(second),
    structuredLeaves: leaves(data.structured),
    hydrationLeaves: leaves(data.hydration),
  });

  const blocks: ClassifiedBlock[] = rendered.map(({ block, tokens }, i) => ({
    ...block,
    state: verdicts[i]?.state ?? "js-added",
    tokens: tokens.length,
    credited: verdicts[i]?.credited ?? 0,
  }));

  const visible = blocks.filter((b) => !b.hidden && b.region !== "dialog");
  const hasMain = visible.some((b) => b.region === "main");
  const main = sum(visible.filter((b) => (hasMain ? b.region === "main" : b.region === "other")));
  const all = sum(visible);

  let cookieLift: number | null = null;
  if (raw.withCookies.ok && raw.withCookies.status >= 200 && raw.withCookies.status <= 299) {
    const withCookies = align({ rendered: renderedTokens, hidden, rawA: rawBlocks(parse(raw.withCookies.html)), rawB: [], structuredLeaves: [], hydrationLeaves: [] });
    const credited = withCookies.verdicts.reduce((n, v, i) => n + (blocks[i] && !blocks[i].hidden && blocks[i].region !== "dialog" ? v.credited : 0), 0);
    cookieLift = all.total === 0 ? 0 : credited / all.total - share(all);
  }

  const serverFields = readFields(first, url, crawlerTokens);
  const renderedLinks = new Set(snapshot.fields.links);
  const serverLinks = new Set(serverFields.links);

  return {
    ok: true,
    url,
    status: raw.first.status,
    blocks,
    removed: removed.map((j) => (firstBlocks[j] ?? []).join(" ")),
    mainBasis: hasMain ? "main-landmark" : "outside-landmarks",
    main,
    all,
    hidden: sum(blocks.filter((b) => b.hidden)),
    cookieLift: cookieLift !== null && cookieLift >= CONFIG.cookieLiftNotice ? cookieLift : null,
    unparsedDataScripts: data.unparsed,
    fields: fieldDiffs(serverFields, snapshot.fields),
    jsOnlyLinks: [...renderedLinks].filter((l) => !serverLinks.has(l)),
    serverHeaders: raw.first.headers,
    serverHtml: raw.first.html,
  };
}
