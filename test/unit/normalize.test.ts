import { describe, expect, it } from "vitest";
import { tokenize } from "../../src/core/normalize";

describe("tokenize", () => {
  it("keeps currency and percent signs as separate tokens", () => {
    expect(tokenize("Sale $10")).toEqual(["sale", "$", "10"]);
    expect(tokenize("Sale $100")).not.toEqual(tokenize("Sale $10"));
    expect(tokenize("20% off")).toEqual(["20", "%", "off"]);
  });

  it("ignores punctuation and whitespace differences", () => {
    expect(tokenize("  Hello,\n  world!  ")).toEqual(tokenize("hello world"));
  });

  it("removes soft hyphens, zero-width and bidi marks", () => {
    expect(tokenize("opti­mi​zation ‏word")).toEqual(["optimization", "word"]);
  });

  it("folds compatibility forms (NFKC)", () => {
    expect(tokenize("ﬁle Ｆｕｌｌ")).toEqual(["file", "full"]);
  });

  it("segments CJK text without spaces", () => {
    expect(tokenize("東京都に住んでいます").length).toBeGreaterThan(1);
  });

  it("treats Turkish dotted capital consistently on both sides", () => {
    expect(tokenize("İSTANBUL")).toEqual(tokenize("İstanbul"));
  });

  it("strips Arabic tatweel", () => {
    expect(tokenize("عـــربي")).toEqual(tokenize("عربي"));
  });
});
