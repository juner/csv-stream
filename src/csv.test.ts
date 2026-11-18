import { describe, test } from "vitest";
import { CsvParseStream, CsvStringifyStream } from "./index.js";

async function parseChunks(chunks: (string | Uint8Array)[], options?: ConstructorParameters<typeof CsvParseStream>[0]) {
  const stream = new CsvParseStream(options);
  const writer = stream.writable.getWriter();
  const writing = (async () => {
    for (const chunk of chunks) await writer.write(chunk);
    await writer.close();
  })();
  const rows = await Array.fromAsync(stream.readable);
  await writing;
  return rows;
}

describe("CsvParseStream", () => {
  test("parses quoted fields and CRLF across chunks", async ({ expect }) => {
    const rows = await parseChunks([
      `name,note\r`,
      `\n"Ada","said ""hello"""\r\n`,
      `"Grace","line one\nline two"`,
    ]);

    expect(rows).toEqual([
      ["name", "note"],
      ["Ada", `said "hello"`],
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
  });

  test("does not emit an extra row after a final line break", async ({ expect }) => {
    expect(await parseChunks(["a,b\n"])).toEqual([["a", "b"]]);
  });

  test("errors on malformed quotes", async ({ expect }) => {
    const stream = new CsvParseStream();
    const writer = stream.writable.getWriter();
    const reading = Array.fromAsync(stream.readable);
    await expect(writer.write("a,b\nbad\"field,x")).rejects.toThrow(SyntaxError);
    await expect(reading).rejects.toThrow(SyntaxError);
  });
});

describe("CsvStringifyStream", () => {
  test("quotes and escapes fields and emits UTF-8 records", async ({ expect }) => {
    const stream = new CsvStringifyStream();
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write(["a", `say "hi"`, "line\nbreak", 42, null]);
      await writer.close();
    })();
    const chunks = await Array.fromAsync(stream.readable);
    await writing;

    expect(chunks.map(chunk => new TextDecoder().decode(chunk)).join(""))
      .toBe(`a,"say ""hi""","line\nbreak",42,\r\n`);
  });

  test("round trips rows with a custom delimiter and line ending", async ({ expect }) => {
    const stringify = new CsvStringifyStream({ delimiter: ";", recordSeparator: "\n" });
    const writer = stringify.writable.getWriter();
    const write = (async () => {
      await writer.write(["one", "two;and more"]);
      await writer.close();
    })();
    const bytes = await new Blob(await Array.fromAsync(stringify.readable)).arrayBuffer();
    await write;

    expect(await parseChunks([new Uint8Array(bytes)], { delimiter: ";" }))
      .toEqual([["one", "two;and more"]]);
  });
});
