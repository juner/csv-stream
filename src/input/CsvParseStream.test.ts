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

  test("supports skipEmptyLines option", async ({ expect }) => {
    expect(await parseChunks(["a,b\n\nc,d\r\n\r\n"])).toEqual([["a", "b"], [""], ["c", "d"], [""]]);
    expect(await parseChunks(["a,b\n\nc,d\r\n\r\n"], { skipEmptyLines: true })).toEqual([["a", "b"], ["c", "d"]]);
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
