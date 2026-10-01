import { describe, expect, it } from "vitest";
import { isNoindex, parseRobotsDirectives } from "../../src/core/xrobots";

const parse = (...v: string[]) => Object.fromEntries([...parseRobotsDirectives(v)].map(([k, s]) => [k, [...s]]));

describe("parseRobotsDirectives", () => {
  it("collects unscoped directives under *", () => {
    expect(parse("NoIndex, NoFollow")).toEqual({ "*": ["noindex", "nofollow"] });
  });

  it("scopes directives after a user-agent prefix", () => {
    expect(parse("googlebot: noindex, nofollow")).toEqual({ googlebot: ["noindex", "nofollow"] });
  });

  it("keeps unscoped directives that precede a prefix", () => {
    expect(parse("nosnippet, googlebot: noindex, otherbot: noarchive")).toEqual({
      "*": ["nosnippet"],
      googlebot: ["noindex"],
      otherbot: ["noarchive"],
    });
  });

  it("does not mistake valued directives for a prefix", () => {
    expect(parse("max-snippet:20, max-image-preview: large, max-video-preview:-1")).toEqual({
      "*": ["max-snippet:20", "max-image-preview:large", "max-video-preview:-1"],
    });
  });

  it("scopes valued directives behind a prefix", () => {
    expect(parse("bingbot: max-snippet:0, noindex")).toEqual({ bingbot: ["max-snippet:0", "noindex"] });
  });

  it("keeps unavailable_after dates containing commas and colons whole", () => {
    expect(parse("unavailable_after: 25 Jun 2010 15:00:00 PST")).toEqual({
      "*": ["unavailable_after:25 jun 2010 15:00:00 pst"],
    });
    expect(parse("unavailable_after: Friday, 25-Aug-2025 13:00:00 GMT, nofollow")).toEqual({
      "*": ["unavailable_after:friday, 25-aug-2025 13:00:00 gmt", "nofollow"],
    });
    expect(parse("googlebot: unavailable_after: 25 Jun 2030 15:00:00 PST, bingbot: noindex")).toEqual({
      googlebot: ["unavailable_after:25 jun 2030 15:00:00 pst"],
      bingbot: ["noindex"],
    });
  });

  it("handles an ISO unavailable_after date", () => {
    expect(parse("unavailable_after: 2030-01-01T00:00:00Z")).toEqual({
      "*": ["unavailable_after:2030-01-01t00:00:00z"],
    });
  });

  it("resets scope per value and merges multiple values", () => {
    expect(parse("googlebot: noindex", "nofollow", "indexifembedded, notranslate")).toEqual({
      googlebot: ["noindex"],
      "*": ["nofollow", "indexifembedded", "notranslate"],
    });
  });

  it("ignores empty pieces and values", () => {
    expect(parse("", " , noindex,, ")).toEqual({ "*": ["noindex"] });
  });
});

describe("isNoindex", () => {
  it("applies * directives to every token", () => {
    expect(isNoindex(parseRobotsDirectives(["noindex"]), "googlebot")).toBe(true);
  });

  it("treats none as noindex", () => {
    expect(isNoindex(parseRobotsDirectives(["none"]), "googlebot")).toBe(true);
  });

  it("applies scoped directives only to that token", () => {
    const d = parseRobotsDirectives(["googlebot: noindex"]);
    expect(isNoindex(d, "googlebot")).toBe(true);
    expect(isNoindex(d, "GoogleBot")).toBe(true);
    expect(isNoindex(d, "bingbot")).toBe(false);
  });

  it("is false for nofollow only", () => {
    expect(isNoindex(parseRobotsDirectives(["nofollow, max-snippet:5"]), "googlebot")).toBe(false);
  });
});
