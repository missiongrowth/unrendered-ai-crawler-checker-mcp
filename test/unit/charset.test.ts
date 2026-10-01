import { describe, expect, it } from "vitest";
import { decodeHtml } from "../../src/core/charset";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((p) => [...p]));

describe("decodeHtml", () => {
  it("defaults to utf-8", () => {
    const r = decodeHtml(new TextEncoder().encode("héllo"), null);
    expect(r).toEqual({ text: "héllo", encoding: "utf-8", source: "default" });
  });

  it("lets a BOM win over the header", () => {
    const bytes = concat(Uint8Array.of(0xef, 0xbb, 0xbf), new TextEncoder().encode("ı"));
    const r = decodeHtml(bytes, "text/html; charset=windows-1254");
    expect(r.source).toBe("bom");
    expect(r.encoding).toBe("utf-8");
    expect(r.text).toBe("ı");
  });

  it("reads UTF-16LE and UTF-16BE BOMs", () => {
    const le = decodeHtml(Uint8Array.of(0xff, 0xfe, 0x41, 0x00), null);
    expect([le.text, le.encoding, le.source]).toEqual(["A", "utf-16le", "bom"]);
    const be = decodeHtml(Uint8Array.of(0xfe, 0xff, 0x00, 0x41), null);
    expect([be.text, be.encoding, be.source]).toEqual(["A", "utf-16be", "bom"]);
  });

  it("decodes Turkish bytes from the header charset", () => {
    const r = decodeHtml(Uint8Array.of(0xfd, 0xde, 0xf0), 'text/html; charset="windows-1254"');
    expect(r.source).toBe("header");
    expect(r.encoding).toBe("windows-1254");
    expect(r.text).toBe("ıŞğ");
  });

  it("header wins over meta", () => {
    const r = decodeHtml(ascii('<meta charset="windows-1252">'), "text/html; charset=utf-8");
    expect(r.source).toBe("header");
    expect(r.encoding).toBe("utf-8");
  });

  it("prescans <meta charset>", () => {
    const bytes = concat(ascii('<html><head><meta charset="windows-1254"></head>'), Uint8Array.of(0xfd));
    const r = decodeHtml(bytes, "text/html");
    expect(r.source).toBe("meta");
    expect(r.encoding).toBe("windows-1254");
    expect(r.text.endsWith("ı")).toBe(true);
  });

  it("prescans http-equiv content-type", () => {
    const r = decodeHtml(
      ascii("<META HTTP-EQUIV='Content-Type' CONTENT='text/html; charset=iso-8859-9'>"),
      null,
    );
    expect(r.source).toBe("meta");
    expect(r.encoding).toBe("windows-1254");
  });

  it("skips commented-out meta tags", () => {
    const r = decodeHtml(ascii('<!-- <meta charset="windows-1254"> --><meta charset="windows-1252">'), null);
    expect(r.encoding).toBe("windows-1252");
  });

  it("ignores a meta tag past the first 1024 bytes", () => {
    const r = decodeHtml(ascii(`${" ".repeat(1100)}<meta charset="windows-1254">`), null);
    expect(r.source).toBe("default");
  });

  it("falls through a bogus header label to meta", () => {
    const r = decodeHtml(ascii('<meta charset="windows-1254">'), "text/html; charset=nonsense-9");
    expect(r.source).toBe("meta");
    expect(r.encoding).toBe("windows-1254");
  });

  it("falls through bogus labels to the default", () => {
    const r = decodeHtml(ascii('<meta charset="nonsense-9">'), "text/html; charset=bogus");
    expect(r.source).toBe("default");
    expect(r.encoding).toBe("utf-8");
  });

  it("treats a meta-declared utf-16 as utf-8", () => {
    const r = decodeHtml(new TextEncoder().encode('<meta charset="utf-16">é'), null);
    expect(r.source).toBe("meta");
    expect(r.encoding).toBe("utf-8");
    expect(r.text.endsWith("é")).toBe(true);
  });
});
