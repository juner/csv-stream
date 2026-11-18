import { describe, test } from "vitest";
import { CsvStringifyStream, stringifyCsv } from "./CsvStringifyStream.js";
import { parseCsv } from "../input/CsvParseStream.js";

describe("CsvStringifyStream", () => {
  test("quotes and escapes fields and emits UTF-8 records", async ({ expect }) => {
    const stream = new CsvStringifyStream();
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write(["a", "say \"hi\"", "line\nbreak", 42, true, 10n, null, undefined]);
      await writer.close();
    })();
    const chunks = await Array.fromAsync(stream.readable);
    await writing;

    expect(chunks.map(chunk => new TextDecoder().decode(chunk)).join(""))
      .toBe("a,\"say \"\"hi\"\"\",\"line\nbreak\",42,true,10,,\r\n");
  });

  test("round trips rows with a custom delimiter and line ending via stringifyCsv", async ({ expect }) => {
    const bytes = stringifyCsv([["one", "two;and more"]], { delimiter: ";", recordSeparator: "\n" });
    const rows = await Array.fromAsync(parseCsv(bytes, { delimiter: ";" }));
    expect(rows).toEqual([["one", "two;and more"]]);
  });

  test("prepends UTF-8 BOM when bom: true is set", async ({ expect }) => {
    const chunks = await Array.fromAsync(stringifyCsv([["a", "b"]], { bom: true, recordSeparator: "\n" }));
    expect(chunks[0]).toEqual(new Uint8Array([0xEF, 0xBB, 0xBF]));
    expect(await Array.fromAsync(parseCsv(chunks))).toEqual([["a", "b"]]);
  });
});
