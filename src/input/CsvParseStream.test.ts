import { describe, test } from "vitest";
import { CsvParseStream, parseCsv } from "./CsvParseStream.js";
import type { CsvParseStreamOptions } from "./CsvParseStream.js";

async function parseChunks(chunks: (string | Uint8Array)[], options?: CsvParseStreamOptions) {
  const stream = new CsvParseStream(options);
  const writer = stream.writable.getWriter();
  const writing = (async () => {
    for (const chunk of chunks) await writer.write(chunk);
    await writer.close();
  })();
  const reading = Array.fromAsync(stream.readable);
  const [rows] = await Promise.all([reading, writing]);
  return rows;
}

describe("CsvParseStream", () => {
  test("parses quoted fields and CRLF across chunks", async ({ expect }) => {
    const rows = await parseChunks([
      "name,note\r",
      "\n\"Ada\",\"said \"\"hello\"\"\"\r\n",
      "\"Grace\",\"line one\nline two\"",
    ]);

    expect(rows).toEqual([
      ["name", "note"],
      ["Ada", "said \"hello\""],
      ["Grace", "line one\nline two"],
    ]);
  });

  test("supports byte chunks, BOM, and custom delimiter", async ({ expect }) => {
    const encoder = new TextEncoder();
    const rows = await parseChunks([
      encoder.encode("\uFEFFa;b\r"),
      encoder.encode("\nc;d"),
    ], { delimiter: ";" });

    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
    expect(await parseChunks(["\uFEFFx,y"])).toEqual([["x", "y"]]);
    expect(await parseChunks(["\uFEFFx,y"], { ignoreBOM: true })).toEqual([["\uFEFFx", "y"]]);
  });

  test("decodes Shift_JIS byte chunks split across multi-byte boundaries", async ({ expect }) => {
    // "名前,備考\r\n山田,\"テスト\"\r\n" in Shift_JIS:
    // 名(0x96 0xBC) 前(0x91 0x4F) ,(0x2C) 備(0x94 0xF5) 考(0x8D 0x6C) \r\n(0x0D 0x0A)
    // 山(0x8E 0x52) 田(0x93 0x63) ,(0x2C) "(0x22) テ(0x83 0x65) ス(0x83 0x58) ト(0x83 0x67) "(0x22) \r\n(0x0D 0x0A)
    // Note: ソ(0x83 0x5C) has 0x5C ('\') as trail byte; 表(0x95 0x5C) also has 0x5C.
    const sjisChunk1 = new Uint8Array([0x96, 0xBC, 0x91, 0x4F, 0x2C, 0x94]);
    const sjisChunk2 = new Uint8Array([0xF5, 0x8D, 0x6C, 0x0D, 0x0A, 0x8E, 0x52, 0x93, 0x63, 0x2C, 0x22, 0x83, 0x65, 0x83, 0x58, 0x83, 0x67, 0x22, 0x0D, 0x0A]);

    const rows = await parseChunks([sjisChunk1, sjisChunk2], { label: "shift_jis" });
    expect(rows).toEqual([
      ["名前", "備考"],
      ["山田", "テスト"],
    ]);
  });

  test("supports fatal TextDecoder option on invalid byte sequences", async ({ expect }) => {
    const invalidUtf8 = new Uint8Array([0xFF, 0xFE]);
    await expect(parseChunks([invalidUtf8], { fatal: true })).rejects.toThrow(TypeError);
  });

  test("handles CR not followed by LF across chunks", async ({ expect }) => {
    const rows = await parseChunks(["a,b\r", "c,d"]);
    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
  });

  test("does not emit an extra row after a final line break or empty stream", async ({ expect }) => {
    expect(await parseChunks(["a,b\n"])).toEqual([["a", "b"]]);
    expect(await parseChunks([])).toEqual([]);
    expect(await parseChunks([""])).toEqual([]);
  });

  test("supports skipEmptyLines and skipHeader options", async ({ expect }) => {
    expect(await parseChunks(["a,b\n\nc,d\r\n\r\n"])).toEqual([["a", "b"], [""], ["c", "d"], [""]]);
    expect(await parseChunks(["a,b\n\nc,d\r\n\r\n"], { skipEmptyLines: true })).toEqual([["a", "b"], ["c", "d"]]);
    expect(await parseChunks(["col1,col2\n1,2\n3,4"], { skipHeader: true })).toEqual([["1", "2"], ["3", "4"]]);
  });

  test("enforces maxLength option", async ({ expect }) => {
    await expect(parseChunks(["abcd,efg"], { maxLength: 5 })).rejects.toThrow(RangeError);
    await expect(parseChunks(["\"abcdef\""], { maxLength: 4 })).rejects.toThrow(RangeError);
    await expect(parseChunks(["\"ab\"\"cd\""], { maxLength: 2 })).rejects.toThrow(RangeError);
  });

  test("errors on malformed quotes by default", async ({ expect }) => {
    await expect(parseChunks(["a,b\nbad\"field,x"])).rejects.toThrow(SyntaxError);
    await expect(parseChunks(["\"a\"x,b"])).rejects.toThrow(SyntaxError);
    await expect(parseChunks(["\"unterminated"])).rejects.toThrow(SyntaxError);
  });

  test("recovers from malformed rows when errorFallback is false", async ({ expect }) => {
    const rows = await parseChunks([
      "a,b\r\n",
      "bad\"field,x\r\n",
      "\"bad\"after,y\n",
      "c,d\n",
      "\"unterminated",
    ], { errorFallback: false });

    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
  });

  test("handles malformed row at EOF without trailing newline when errorFallback is false", async ({ expect }) => {
    const rows = await parseChunks([
      "a,b\n",
      "bad\"field,x",
    ], { errorFallback: false });

    expect(rows).toEqual([["a", "b"]]);
  });

  test("invokes custom errorFallback function", async ({ expect }) => {
    const errors: unknown[] = [];
    const rows = await parseChunks([
      "a,b\n",
      "bad\"field,x\n",
      "c,d",
    ], {
      errorFallback(err, { row, field, enqueue }) {
        errors.push(err);
        enqueue([...row, `${field}_recovered`]);
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(SyntaxError);
    expect(rows).toEqual([
      ["a", "b"],
      ["bad_recovered"],
      ["c", "d"],
    ]);
  });
});

describe("parseCsv", () => {
  test("yields parsed rows from an iterable", async ({ expect }) => {
    const rows: string[][] = [];
    for await (const row of parseCsv(["a,b\n", "c,d"])) {
      rows.push(row);
    }
    expect(rows).toEqual([["a", "b"], ["c", "d"]]);
  });
});
