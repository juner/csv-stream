import { describe, test } from "vitest";
import { detectCsvCharset, detectCsvStreamFormat, parseCsvResponse } from "./parseCsvResponse.js";

describe("detectCsvStreamFormat", () => {
  test("detects csv and tsv MIME types", ({ expect }) => {
    expect(detectCsvStreamFormat("text/csv")).toBe("csv");
    expect(detectCsvStreamFormat("text/csv; charset=utf-8")).toBe("csv");
    expect(detectCsvStreamFormat("application/csv")).toBe("csv");
    expect(detectCsvStreamFormat("text/tab-separated-values")).toBe("tsv");
    expect(detectCsvStreamFormat("text/tsv")).toBe("tsv");
    expect(detectCsvStreamFormat("application/json")).toBeUndefined();
    expect(detectCsvStreamFormat(null)).toBeUndefined();
  });
});

describe("detectCsvCharset", () => {
  test("extracts unquoted and quoted charset parameters", ({ expect }) => {
    expect(detectCsvCharset("text/csv; charset=Shift_JIS")).toBe("Shift_JIS");
    expect(detectCsvCharset("text/csv; charset=\"utf-8\"")).toBe("utf-8");
    expect(detectCsvCharset("text/csv")).toBeUndefined();
    expect(detectCsvCharset(null)).toBeUndefined();
  });
});

describe("parseCsvResponse", () => {
  test("parses a text/csv Response", async ({ expect }) => {
    const response = new Response("a,b\n1,2", {
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
    const rows = await Array.fromAsync(parseCsvResponse(response));
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("parses a Shift_JIS Response using charset from Content-Type", async ({ expect }) => {
    // "あ,い\n" in Shift_JIS: あ(0x82 0xA0) ,(0x2C) い(0x82 0xA2) \n(0x0A)
    const sjisBytes = new Uint8Array([0x82, 0xA0, 0x2C, 0x82, 0xA2, 0x0A]);
    const response = new Response(sjisBytes, {
      headers: { "content-type": "text/csv; charset=Shift_JIS" },
    });
    const rows = await Array.fromAsync(parseCsvResponse(response));
    expect(rows).toEqual([["あ", "い"]]);
  });

  test("parses a text/tab-separated-values Response", async ({ expect }) => {
    const response = new Response("a\tb\n1\t2", {
      headers: { "content-type": "text/tab-separated-values" },
    });
    const rows = await Array.fromAsync(parseCsvResponse(response));
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("allows explicit format and delimiter overrides", async ({ expect }) => {
    const response = new Response("a;b\n1;2", {
      headers: { "content-type": "text/plain" },
    });
    const rows = await Array.fromAsync(parseCsvResponse(response, { format: "csv", delimiter: ";" }));
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  test("throws when content-type is unsupported or body is null", ({ expect }) => {
    const badType = new Response("a,b", {
      headers: { "content-type": "application/octet-stream" },
    });
    expect(() => parseCsvResponse(badType)).toThrow(TypeError);

    const noBody = new Response(null, {
      headers: { "content-type": "text/csv" },
    });
    expect(() => parseCsvResponse(noBody)).toThrow(TypeError);
  });
});
