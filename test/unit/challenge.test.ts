import { describe, expect, it } from "vitest";
import { detectChallenge } from "../../src/core/challenge";

const h = (init: Record<string, string>) => new Headers(init);

describe("detectChallenge", () => {
  it("reads Cloudflare cf-mitigated: challenge", () => {
    expect(detectChallenge(h({ "cf-mitigated": "challenge", server: "cloudflare" }))).toEqual({
      vendor: "Cloudflare",
      header: "cf-mitigated",
      value: "challenge",
    });
  });

  it("reads AWS WAF challenge and captcha actions", () => {
    expect(detectChallenge(h({ "x-amzn-waf-action": "challenge" }))?.vendor).toBe("AWS WAF");
    expect(detectChallenge(h({ "x-amzn-waf-action": "CAPTCHA" }))?.vendor).toBe("AWS WAF");
  });

  it("reads DataDome X-DD-B by presence", () => {
    expect(detectChallenge(h({ "X-DD-B": "1" }))?.vendor).toBe("DataDome");
  });

  it("ignores headers every protected response carries", () => {
    expect(detectChallenge(h({ server: "cloudflare", "cf-ray": "8a1b", "x-sucuri-id": "11012" }))).toBeNull();
  });

  it("ignores undocumented values", () => {
    expect(detectChallenge(h({ "cf-mitigated": "block" }))).toBeNull();
    expect(detectChallenge(h({ "x-amzn-waf-action": "allow" }))).toBeNull();
  });
});
