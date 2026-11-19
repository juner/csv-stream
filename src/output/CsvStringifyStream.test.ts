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

  test("terminates cleanly and closes the source when breaking out of stringifyCsv early", async ({ expect }) => {
    let sourceClosed = false;
    function* source() {
      try {
        yield ["a", "b"] as const;
        yield ["c", "d"] as const;
        yield ["e", "f"] as const;
      }
      finally {
        sourceClosed = true;
      }
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stringifyCsv(source(), { recordSeparator: "\n" })) {
      chunks.push(chunk);
      break;
    }

    expect(chunks.map(chunk => new TextDecoder().decode(chunk))).toEqual(["a,b\n"]);
    expect(sourceClosed).toBe(true);
  });

  test("propagates upstream abort in CsvStringifyStream and stringifyCsv", async ({ expect }) => {
    const abortReason = new DOMException("Upstream aborted", "AbortError");
    const stream = new CsvStringifyStream({ recordSeparator: "\n" });
    const writer = stream.writable.getWriter();
    const chunks: Uint8Array[] = [];

    const reading = (async () => {
      for await (const chunk of stream.readable) {
        chunks.push(chunk);
      }
    })();

    await writer.write(["a", "b"]);
    await writer.abort(abortReason);

    await expect(reading).rejects.toBe(abortReason);
    expect(chunks.map(chunk => new TextDecoder().decode(chunk))).toEqual(["a,b\n"]);

    function* failingSource() {
      yield ["a", "b"] as const;
      throw abortReason;
    }

    const iterChunks: Uint8Array[] = [];
    await expect((async () => {
      for await (const chunk of stringifyCsv(failingSource(), { recordSeparator: "\n" })) {
        iterChunks.push(chunk);
      }
    })()).rejects.toBe(abortReason);
    expect(iterChunks.map(chunk => new TextDecoder().decode(chunk))).toEqual(["a,b\n"]);
  });
});
