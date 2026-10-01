import { describe, expect, it } from "vitest";
import { contentSignals, robotsVerdict } from "../../src/core/robots";
import vectors from "./robots-vectors.json";

type Vector = { name: string; robotstxt: string; agent: string; url: string; expected: boolean };

const ok = (body: string) => ({ status: 200, body });

describe("robotsVerdict vectors", () => {
  it("has the full vector set", () => {
    expect(vectors).toHaveLength(145);
  });

  it.each(vectors as Vector[])("$name", (v) => {
    expect(robotsVerdict(ok(v.robotstxt), v.agent, v.url).allowed).toBe(v.expected);
  });
});

describe("robotsVerdict fetch outcomes", () => {
  const body = "User-agent: *\nDisallow: /\n";
  it.each([404, 410, 401, 403])("%i allows all", (status) => {
    expect(robotsVerdict({ status, body }, "Bot", "https://a.com/x")).toEqual({
      allowed: true,
      reason: "4xx-allow-all",
      line: null,
      lineText: null,
      specificGroup: false,
    });
  });

  it.each([500, 503])("%i disallows all", (status) => {
    const v = robotsVerdict({ status, body: "" }, "Bot", "https://a.com/x");
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("5xx-disallow-all");
  });

  it("a challenge page leaves the rules unknown", () => {
    const challenge = { vendor: "Cloudflare", header: "cf-mitigated", value: "challenge" };
    const v = robotsVerdict({ challenge, status: 403 }, "Bot", "https://a.com/x");
    expect(v.allowed).toBeNull();
    expect(v.reason).toBe("challenged");
  });

  it("network error disallows all", () => {
    const v = robotsVerdict({ error: "ECONNRESET" }, "Bot", "https://a.com/x");
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("unreachable-disallow-all");
  });
});

describe("robotsVerdict rule reporting", () => {
  it("reports the matching line and text", () => {
    const txt = "# c\nUser-agent: *\nAllow: /a\nDisallow: /private/  # note\n";
    const v = robotsVerdict(ok(txt), "Bot", "https://a.com/private/x");
    expect(v).toEqual({
      allowed: false,
      reason: "rules",
      line: 4,
      lineText: "Disallow: /private/  # note",
      specificGroup: false,
    });
  });

  it("flags a specific group", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n";
    const v = robotsVerdict(ok(txt), "GPTBot", "https://a.com/x");
    expect(v.allowed).toBe(true);
    expect(v.line).toBe(5);
    expect(v.specificGroup).toBe(true);
  });

  it("counts CRLF lines once", () => {
    const v = robotsVerdict(ok("User-agent: *\r\n\r\nDisallow: /x\r\n"), "Bot", "https://a.com/x");
    expect(v.line).toBe(3);
    expect(v.lineText).toBe("Disallow: /x");
  });

  it("reports no-matching-rule", () => {
    const v = robotsVerdict(ok("User-agent: *\nDisallow: /a\n"), "Bot", "https://a.com/b");
    expect(v).toEqual({ allowed: true, reason: "no-matching-rule", line: null, lineText: null, specificGroup: false });
  });

  it("parses only the first 500 KiB", () => {
    const pad = "# pad\n".repeat(Math.ceil((500 * 1024) / 6));
    const body = `User-agent: *\n${pad}Disallow: /\n`;
    expect(new TextEncoder().encode(body).length).toBeGreaterThan(500 * 1024);
    expect(robotsVerdict(ok(body), "Bot", "https://a.com/x").allowed).toBe(true);
    const early = `User-agent: *\nDisallow: /\n${pad}`;
    expect(robotsVerdict(ok(early), "Bot", "https://a.com/x").allowed).toBe(false);
  });
});

describe("contentSignals", () => {
  it("collects signals per group", () => {
    const txt = [
      "User-agent: *",
      "Content-Signal: search=yes, ai-train=no",
      "Allow: /",
      "",
      "User-agent: GPTBot",
      "User-agent: ClaudeBot",
      "Content-Signal: ai-train=no",
      "Disallow: /x",
    ].join("\n");
    expect(contentSignals(txt)).toEqual([
      { agents: ["*"], value: "search=yes, ai-train=no", line: 2 },
      { agents: ["GPTBot", "ClaudeBot"], value: "ai-train=no", line: 7 },
    ]);
  });

  it("matches the key case-insensitively and trims the value", () => {
    const txt = "user-agent: *\nCONTENT-SIGNAL:   ai-input=yes  \n";
    expect(contentSignals(txt)).toEqual([{ agents: ["*"], value: "ai-input=yes", line: 2 }]);
  });

  it("a rule line ends the agent list", () => {
    const txt = "User-agent: A\nDisallow: /\nUser-agent: B\nContent-Signal: search=no\n";
    expect(contentSignals(txt)).toEqual([{ agents: ["B"], value: "search=no", line: 4 }]);
  });

  it("returns nothing without signals", () => {
    expect(contentSignals("User-agent: *\nDisallow:\n")).toEqual([]);
  });
});
