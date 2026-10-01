import { describe, expect, it } from "vitest";
import { align, type AlignInput } from "../../src/core/align";
import { tokenize } from "../../src/core/normalize";

const blocks = (...texts: string[]) => texts.map(tokenize);
const run = (partial: Partial<Record<Exclude<keyof AlignInput, "hidden">, string[]>> & { rendered: string[]; hidden?: boolean[] }) =>
  align({
    rendered: blocks(...partial.rendered),
    hidden: partial.hidden ?? partial.rendered.map(() => false),
    rawA: blocks(...(partial.rawA ?? [])),
    rawB: blocks(...(partial.rawB ?? partial.rawA ?? [])),
    structuredLeaves: blocks(...(partial.structuredLeaves ?? [])),
    hydrationLeaves: blocks(...(partial.hydrationLeaves ?? [])),
  });
const states = (r: ReturnType<typeof align>) => r.verdicts.map((v) => v.state);

describe("align", () => {
  it("marks identical server-rendered blocks as server", () => {
    const r = run({ rendered: ["Title", "First paragraph here"], rawA: ["Title", "First paragraph here"] });
    expect(states(r)).toEqual(["server", "server"]);
    expect(r.verdicts.map((v) => v.credited)).toEqual([1, 3]);
    expect(r.removed).toEqual([]);
  });

  it("credits repeated text only as often as the server sent it", () => {
    const r = run({
      rendered: ["Header", "Add to cart", "Add to cart", "Add to cart"],
      rawA: ["Header", "Add to cart"],
    });
    expect(states(r).filter((s) => s === "server")).toHaveLength(2);
    expect(states(r).filter((s) => s === "ambiguous")).toHaveLength(2);
  });

  it("prefers the in-order alignment over a scattered one", () => {
    const r = run({ rendered: ["A long anchor block", "Read more", "Another anchor block"], rawA: ["Read more", "A long anchor block", "Read more", "Another anchor block"] });
    expect(states(r)).toEqual(["server", "server", "server"]);
    expect(r.removed).toEqual([]);
  });

  it("does not let a price match a different price", () => {
    const r = run({ rendered: ["Now $10"], rawA: ["Now $100"] });
    expect(states(r)).toEqual(["js-added"]);
  });

  it("classifies a JS-edited block as partial with the LCS credited", () => {
    const r = run({
      rendered: ["Intro", "The quick brown fox jumps over the lazy dog today", "Outro"],
      rawA: ["Intro", "The quick brown fox jumps over the lazy dog", "Outro"],
    });
    expect(r.verdicts[1]).toEqual({ state: "partial", credited: 9 });
  });

  it("never treats unrelated text as partial", () => {
    const r = run({ rendered: ["Intro", "completely different words appear here", "Outro"], rawA: ["Intro", "nothing alike in this raw block", "Outro"] });
    expect(r.verdicts[1]?.state).toBe("js-added");
    expect(r.removed).toEqual([1]);
  });

  it("flags text that differs between two identical raw fetches as volatile", () => {
    const r = run({ rendered: ["Header", "Offer B"], rawA: ["Header", "Offer A"], rawB: ["Header", "Offer B"] });
    expect(r.verdicts[1]?.state).toBe("volatile");
  });

  it("separates structured data from hydration data", () => {
    const r = run({
      rendered: ["Acme Rocket Skates for fast runners", "Free shipping on all orders today"],
      rawA: [],
      structuredLeaves: ["Acme Rocket Skates for fast runners and more"],
      hydrationLeaves: ["Free shipping", "on all orders today"],
    });
    expect(states(r)).toEqual(["structured-data", "hydration-data"]);
  });

  it("matches short blocks to data only by whole-leaf equality", () => {
    const r = run({ rendered: ["Buy now", "Sale"], hydrationLeaves: ["Buy now", "Big sale event"] });
    expect(states(r)).toEqual(["hydration-data", "js-added"]);
  });

  it("marks a pure client-rendered page as js-added", () => {
    const r = run({ rendered: ["Welcome to the app", "Dashboard"], rawA: ["Loading"] });
    expect(states(r)).toEqual(["js-added", "js-added"]);
    expect(r.removed).toEqual([0]);
  });

  // MDN: one raw <pre> becomes an editor with a line-number gutter and one div per line.
  const code = '<article class="forecast"> <h1>Weather forecast for Seattle</h1> <p>Rain.</p> </article>';
  const lines = ['<article class="forecast">', "<h1>Weather forecast for Seattle</h1>", "<p>Rain.</p>", "</article>"];

  it("credits lines JavaScript split out of one raw block, short lines through their neighbours", () => {
    const r = run({ rendered: ["Try it", "1", "2", "3", "4", ...lines, "Examples"], rawA: ["Try it", code, "Examples"] });
    expect(states(r)).toEqual(["server", "js-added", "js-added", "js-added", "js-added", "server", "server", "server", "server", "server"]);
    expect(r.verdicts.slice(5, 9).map((v) => v.credited)).toEqual([3, 6, 3, 1]);
  });

  it("does not let a hidden copy take the raw block from visible text", () => {
    const r = run({
      rendered: ["Try it", ...lines, code, "Examples", "Try it"],
      hidden: [false, false, false, false, false, true, false, true],
      rawA: ["Try it", code, "Examples"],
    });
    expect(states(r)).toEqual(["server", "server", "server", "server", "server", "server", "server", "ambiguous"]);
  });

  it("does not report raw text merged into a bigger rendered block as removed", () => {
    const r = run({ rendered: ["Part one part two"], rawA: ["Part one", "part two"] });
    expect(r.removed).toEqual([]);
  });
});
