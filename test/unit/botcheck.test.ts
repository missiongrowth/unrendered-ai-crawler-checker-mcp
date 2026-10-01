import { describe, expect, it } from "vitest";
import { classify, jaccard } from "../../src/core/botcheck";
import type { RawResponse } from "../../src/messages";

type Ok = Extract<RawResponse, { ok: true }>;

const res = (over: Partial<Ok> = {}): Ok => ({
  ok: true,
  status: 200,
  url: "https://a.test/",
  redirected: false,
  headers: {},
  html: "",
  encoding: "utf-8",
  truncated: false,
  ...over,
});
const never = () => {
  throw new Error("similarity must not be computed");
};

describe("jaccard", () => {
  it("is 1 for equal sets, including two empty ones", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(1);
    expect(jaccard(new Set(), new Set())).toBe(1);
  });

  it("is shared over union", () => {
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5);
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });
});

describe("classify", () => {
  it("reports a challenge before any status", () => {
    const v = classify(res({ status: 403, headers: { "cf-mitigated": "challenge" } }), "https://a.test/", never, 1);
    expect(v).toMatchObject({ kind: "challenged", status: 403 });
  });

  it("separates 429 from other non-2xx", () => {
    expect(classify(res({ status: 429 }), null, never, 1)).toEqual({ kind: "rate-limited", status: 429 });
    expect(classify(res({ status: 403 }), null, never, 1)).toEqual({ kind: "blocked", status: 403 });
    expect(classify(res({ status: 301 }), null, never, 1)).toEqual({ kind: "blocked", status: 301 });
  });

  it("flags a final URL that differs from the control's", () => {
    const v = classify(res({ url: "https://a.test/login" }), "https://a.test/", never, 1);
    expect(v).toEqual({ kind: "redirected-elsewhere", finalUrl: "https://a.test/login" });
  });

  it("is same when the best similarity reaches the control-vs-control noise floor", () => {
    expect(classify(res(), "https://a.test/", () => [0.7, 0.9], 0.9)).toEqual({ kind: "same", similarity: 0.9 });
    expect(classify(res(), "https://a.test/", () => [0.7, 0.8], 0.9)).toEqual({ kind: "different", similarity: 0.8 });
  });

  it("with one control, same only when identical", () => {
    expect(classify(res(), null, () => [1], null)).toEqual({ kind: "same", similarity: 1 });
    expect(classify(res(), null, () => [0.99], null)).toEqual({ kind: "different", similarity: 0.99 });
  });

  it("errors when no control is available", () => {
    expect(classify(res(), null, () => [], null).kind).toBe("error");
  });
});
