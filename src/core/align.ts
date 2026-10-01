import { CONFIG } from "../config";

export type BlockState =
  | "server"
  | "partial"
  | "ambiguous"
  | "volatile"
  | "structured-data"
  | "hydration-data"
  | "js-added";

export interface Verdict {
  state: BlockState;
  /** Tokens of the block credited as present in the server HTML (all for `server`, LCS length for `partial`, else 0). */
  credited: number;
}

/** Every token list passed in must be non-empty. */
export interface AlignInput {
  /** Rendered blocks in document order, each tokenized. */
  rendered: readonly (readonly string[])[];
  /** Parallel to `rendered`. A hidden block never takes a raw block from visible text that repeats it. */
  hidden: readonly boolean[];
  /** Raw blocks of the first raw fetch, document order. */
  rawA: readonly (readonly string[])[];
  /** Raw blocks of the second raw fetch (noise floor). */
  rawB: readonly (readonly string[])[];
  /** String leaves of `application/ld+json` scripts. */
  structuredLeaves: readonly (readonly string[])[];
  /** String leaves of known hydration containers. */
  hydrationLeaves: readonly (readonly string[])[];
}

export interface AlignResult {
  verdicts: Verdict[];
  /** Indices into `rawA` whose text does not occur anywhere in the rendered page. */
  removed: number[];
}

const key = (tokens: readonly string[]) => tokens.join(" ");

/** Token sequence searchable for contiguous containment; leaf boundaries are ignored. */
class TokenStream {
  private readonly tokens: string[] = [];
  private readonly at = new Map<string, number[]>();
  readonly keys = new Set<string>();

  constructor(seqs: readonly (readonly string[])[]) {
    for (const seq of seqs) {
      this.keys.add(key(seq));
      for (const t of seq) {
        const list = this.at.get(t);
        if (list) list.push(this.tokens.length);
        else this.at.set(t, [this.tokens.length]);
        this.tokens.push(t);
      }
    }
  }

  contains(seq: readonly string[]): boolean {
    let anchor = 0;
    let anchorHits: number[] | undefined;
    for (const [i, t] of seq.entries()) {
      const hits = this.at.get(t);
      if (!hits) return false;
      if (!anchorHits || hits.length < anchorHits.length) {
        anchor = i;
        anchorHits = hits;
      }
    }
    if (!anchorHits) return false;
    outer: for (const hit of anchorHits) {
      const start = hit - anchor;
      if (start < 0 || start + seq.length > this.tokens.length) continue;
      for (const [i, t] of seq.entries()) if (this.tokens[start + i] !== t) continue outer;
      return true;
    }
    return false;
  }
}

/**
 * Heaviest monotone chain of exact block matches (weighted LIS over candidate
 * pairs, Fenwick tree for prefix maxima). Each raw block is used at most once,
 * so repeated text such as "Add to cart" cannot be credited more often than the
 * server sent it.
 */
function exactChain(rendered: AlignInput["rendered"], raw: AlignInput["rawA"], eligible: (i: number, j: number) => boolean): Map<number, number> {
  const rawByKey = new Map<string, number[]>();
  raw.forEach((tokens, j) => {
    const k = key(tokens);
    const list = rawByKey.get(k);
    if (list) list.push(j);
    else rawByKey.set(k, [j]);
  });

  const size = raw.length;
  const treeScore = new Float64Array(size + 1);
  const treeNode = new Int32Array(size + 1).fill(-1);
  const nodeI: number[] = [];
  const nodeJ: number[] = [];
  const nodePrev: number[] = [];
  let best = -1;
  let bestScore = 0;

  const query = (j: number): [number, number] => {
    let score = 0;
    let node = -1;
    for (let x = j; x > 0; x -= x & -x) {
      const s = treeScore[x] ?? 0;
      if (s > score) {
        score = s;
        node = treeNode[x] ?? -1;
      }
    }
    return [score, node];
  };
  const update = (j: number, score: number, node: number) => {
    for (let x = j + 1; x <= size; x += x & -x) {
      if (score > (treeScore[x] ?? 0)) {
        treeScore[x] = score;
        treeNode[x] = node;
      }
    }
  };

  rendered.forEach((tokens, i) => {
    const candidates = rawByKey.get(key(tokens));
    if (!candidates) return;
    // Descending j: one rendered block can never chain onto itself.
    for (let c = candidates.length - 1; c >= 0; c--) {
      const j = candidates[c] ?? 0;
      if (!eligible(i, j)) continue;
      const [prevScore, prevNode] = query(j);
      const score = prevScore + tokens.length;
      const node = nodeI.length;
      nodeI.push(i);
      nodeJ.push(j);
      nodePrev.push(prevNode);
      update(j, score, node);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
  });

  const chain = new Map<number, number>();
  for (let n = best; n !== -1; n = nodePrev[n] ?? -1) chain.set(nodeI[n] ?? 0, nodeJ[n] ?? 0);
  return chain;
}

/** Length of the longest common subsequence of two token lists. */
function lcs(a: readonly string[], b: readonly string[]): number {
  let prev = new Uint32Array(b.length + 1);
  let curr = new Uint32Array(b.length + 1);
  for (const ta of a) {
    for (let j = 1; j <= b.length; j++) {
      curr[j] = ta === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

export function align(input: AlignInput): AlignResult {
  const { rendered, hidden, rawA, rawB } = input;
  // Visible text first, so a hidden copy (a collapsed tab, a template the page clones) cannot take its raw block.
  const chain = exactChain(rendered, rawA, (i) => hidden[i] !== true);
  const usedRaw = new Set(chain.values());
  const hiddenChain = exactChain(rendered, rawA, (i, j) => hidden[i] === true && !usedRaw.has(j));
  const keysA = new Set(rawA.map(key));
  const keysB = new Set(rawB.map(key));
  const structured = new TokenStream(input.structuredLeaves);
  const hydration = new TokenStream(input.hydrationLeaves);

  // Raw window per gap: unmatched raw blocks strictly between the neighbouring anchors.
  const anchorBefore: number[] = [];
  let last = -1;
  rendered.forEach((_, i) => {
    last = chain.get(i) ?? last;
    anchorBefore.push(last);
  });
  const anchorAfter: number[] = new Array<number>(rendered.length);
  let next = rawA.length;
  for (let i = rendered.length - 1; i >= 0; i--) {
    next = chain.get(i) ?? next;
    anchorAfter[i] = next;
  }
  const windows = new Map<string, { tokens: string[]; vocab: Set<string>; stream: TokenStream }>();
  const windowFor = (i: number) => {
    const from = (anchorBefore[i] ?? -1) + 1;
    const to = anchorAfter[i] ?? rawA.length;
    const id = `${from}:${to}`;
    let w = windows.get(id);
    if (!w) {
      const tokens: string[] = [];
      for (let j = from; j < to && tokens.length < CONFIG.partialWindowTokens; j++) {
        if (!usedRaw.has(j)) tokens.push(...(rawA[j] ?? []));
      }
      const kept = tokens.slice(0, CONFIG.partialWindowTokens);
      w = { tokens: kept, vocab: new Set(tokens), stream: new TokenStream([kept]) };
      windows.set(id, w);
    }
    return w;
  };

  const dataState = (tokens: readonly string[]): BlockState | null => {
    const k = key(tokens);
    const fuzzy = tokens.length >= CONFIG.minTokensForFuzzy;
    if (structured.keys.has(k) || (fuzzy && structured.contains(tokens))) return "structured-data";
    if (hydration.keys.has(k) || (fuzzy && hydration.contains(tokens))) return "hydration-data";
    return null;
  };

  // JavaScript can split one raw block into several (a code editor makes one div per line).
  // A block shorter than minTokensForFuzzy counts only together with a neighbour, so a lone "1" never matches.
  const inOrder = (i: number, stream: TokenStream) => {
    const tokens = rendered[i] ?? [];
    if (tokens.length >= CONFIG.minTokensForFuzzy) return stream.contains(tokens);
    const prev = rendered[i - 1];
    const next = rendered[i + 1];
    return [prev && [...prev, ...tokens], next && [...tokens, ...next]].some(
      (seq) => seq !== undefined && seq.length >= CONFIG.minTokensForFuzzy && stream.contains(seq),
    );
  };

  const verdicts = rendered.map((tokens, i): Verdict => {
    if (chain.has(i) || hiddenChain.has(i)) return { state: "server", credited: tokens.length };
    const k = key(tokens);
    if (keysA.has(k)) return { state: "ambiguous", credited: 0 };
    const w = windowFor(i);
    if (inOrder(i, w.stream)) return { state: "server", credited: tokens.length };
    if (tokens.length >= CONFIG.minTokensForFuzzy) {
      const shared = tokens.filter((t) => w.vocab.has(t)).length;
      if (shared / tokens.length >= CONFIG.partialMinShare) {
        const common = lcs(tokens, w.tokens);
        if (common / tokens.length >= CONFIG.partialMinShare) return { state: "partial", credited: common };
      }
    }
    if (keysB.has(k)) return { state: "volatile", credited: 0 };
    return { state: dataState(tokens) ?? "js-added", credited: 0 };
  });

  const renderedStream = new TokenStream(rendered);
  const removed: number[] = [];
  rawA.forEach((tokens, j) => {
    if (!usedRaw.has(j) && !renderedStream.keys.has(key(tokens)) && !renderedStream.contains(tokens)) removed.push(j);
  });

  return { verdicts, removed };
}
