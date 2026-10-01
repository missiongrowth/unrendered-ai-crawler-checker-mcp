import { describe, expect, it } from "vitest";
import { detectChallenge } from "../../src/core/challenge";

const res = (status: number, headers: Record<string, string>, body: string) =>
  detectChallenge({ status, headers: new Headers(headers), body });

describe("detectChallenge vendors", () => {
  it("cloudflare: cf-mitigated header + status", () => {
    const r = res(403, { "cf-mitigated": "challenge" }, "<html></html>");
    expect(r).toMatchObject({ challenged: true, vendor: "cloudflare" });
    expect(r.signals).toContain("header:cf-mitigated");
  });

  it("cloudflare: server header + interstitial body on 200", () => {
    const r = res(200, { server: "cloudflare" }, "<title>Just a moment...</title>");
    expect(r).toMatchObject({ challenged: true, vendor: "cloudflare" });
  });

  it("cloudflare: 503 + challenge-platform script", () => {
    const r = res(503, {}, '<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>');
    expect(r).toMatchObject({ challenged: true, vendor: "cloudflare" });
  });

  it("akamai: AkamaiGHost + reference page", () => {
    const r = res(403, { server: "AkamaiGHost" }, "<H1>Access Denied</H1> https://errors.edgesuite.net/18.2f.1");
    expect(r).toMatchObject({ challenged: true, vendor: "akamai" });
  });

  it("datadome: x-datadome header + captcha-delivery body", () => {
    const r = res(403, { "x-datadome": "protected" }, '<script src="https://ct.captcha-delivery.com/c.js"></script>');
    expect(r).toMatchObject({ challenged: true, vendor: "datadome" });
  });

  it("perimeterx: 403 + px-captcha", () => {
    const r = res(403, {}, '<div id="px-captcha"></div>');
    expect(r).toMatchObject({ challenged: true, vendor: "perimeterx" });
  });

  it("imperva: x-iinfo + incapsula resource", () => {
    const r = res(200, { "x-iinfo": "12-345" }, '<iframe src="/_Incapsula_Resource?SWUDNSAI=31"></iframe>');
    expect(r).toMatchObject({ challenged: true, vendor: "imperva" });
  });

  it("aws waf: challenge action header + 202", () => {
    const r = res(202, { "x-amzn-waf-action": "challenge" }, "<script>AwsWafIntegration.saveReferrer()</script>");
    expect(r).toMatchObject({ challenged: true, vendor: "aws-waf" });
    expect(r.signals).toContain("status:202");
  });

  it("sucuri: x-sucuri-id + firewall page", () => {
    const r = res(403, { "x-sucuri-id": "15008" }, "<title>Sucuri WebSite Firewall - Access Denied</title>");
    expect(r).toMatchObject({ challenged: true, vendor: "sucuri" });
  });

  it("vercel: mitigated header + checkpoint page", () => {
    const r = res(429, { "x-vercel-mitigated": "challenge" }, "<title>Vercel Security Checkpoint</title>");
    expect(r).toMatchObject({ challenged: true, vendor: "vercel" });
  });

  it("kasada: x-kpsdk header + 429", () => {
    const r = res(429, { "x-kpsdk-ct": "abc" }, "");
    expect(r).toMatchObject({ challenged: true, vendor: "kasada" });
  });

  it("f5: rejected page + BigIP server", () => {
    const r = res(200, { server: "BigIP" }, "The requested URL was rejected. Please consult with your administrator. Your support ID is: 123");
    expect(r).toMatchObject({ challenged: true, vendor: "f5" });
  });
});

describe("detectChallenge false positives", () => {
  it("ignores an article mentioning Cloudflare on 200", () => {
    const r = res(200, { server: "cloudflare" }, "<article>Cloudflare released a new challenge product this week.</article>");
    expect(r.challenged).toBe(false);
  });

  it("ignores a single body marker on a 200 page", () => {
    const r = res(200, {}, "<article>How to read cf-chl cookies and /cdn-cgi/challenge-platform/ paths</article>");
    expect(r.challenged).toBe(false);
    expect(r.vendor).toBe("cloudflare");
  });

  it("ignores a plain 403 from a Cloudflare-fronted origin", () => {
    expect(res(403, { server: "cloudflare" }, "Forbidden").challenged).toBe(false);
  });

  it("ignores a plain 503 without markers", () => {
    expect(res(503, {}, "Service Unavailable")).toEqual({ challenged: false, vendor: null, signals: [] });
  });

  it("ignores a normal page", () => {
    expect(res(200, { server: "nginx" }, "<h1>Hello</h1>").challenged).toBe(false);
  });
});
