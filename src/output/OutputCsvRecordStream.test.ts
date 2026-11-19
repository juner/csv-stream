import { describe, test } from "vitest";
import { CsvRecordToRowStream, OutputCsvRecordStream, stringifyCsvRecords } from "./OutputCsvRecordStream.js";
import { parseCsvRecords } from "../input/CsvRecordStream.js";

describe("CsvRecordToRowStream", () => {
  test("infers headers from the first record by default", async ({ expect }) => {
    const stream = new CsvRecordToRowStream();
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write({ id: 1, name: "Ada" });
      await writer.write({ id: 2, name: "Grace" });
      await writer.close();
    })();
    const rows = await Array.fromAsync(stream.readable);
    await writing;

    expect(rows).toEqual([
      ["id", "name"],
      [1, "Ada"],
      [2, "Grace"],
    ]);
  });

  test("emits explicit headers immediately on start", async ({ expect }) => {
    const stream = new CsvRecordToRowStream({ headers: ["name", "id"] });
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write({ id: 1, name: "Ada" });
      await writer.close();
    })();
    const rows = await Array.fromAsync(stream.readable);
    await writing;

    expect(rows).toEqual([
      ["name", "id"],
      ["Ada", 1],
    ]);
  });

  test("omits header row when includeHeader is false", async ({ expect }) => {
    const stream = new CsvRecordToRowStream({ includeHeader: false });
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write({ id: 1, name: "Ada" });
      await writer.close();
    })();
    const rows = await Array.fromAsync(stream.readable);
    await writing;

    expect(rows).toEqual([[1, "Ada"]]);
  });
});

describe("OutputCsvRecordStream and stringifyCsvRecords", () => {
  test("serializes record objects and round-trips with parseCsvRecords", async ({ expect }) => {
    const chunks = stringifyCsvRecords([
      { id: "1", name: "Ada, Countess" },
      { id: "2", name: "Grace" },
    ]);
    const records = await Array.fromAsync(parseCsvRecords(chunks));

    expect(records).toEqual([
      { id: "1", name: "Ada, Countess" },
      { id: "2", name: "Grace" },
    ]);
  });

  test("exposes writable and readable on OutputCsvRecordStream", async ({ expect }) => {
    const stream = new OutputCsvRecordStream({ recordSeparator: "\n" });
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write({ a: 1, b: 2 });
      await writer.close();
    })();
    const chunks = await Array.fromAsync(stream.readable);
    await writing;

    expect(chunks.map(c => new TextDecoder().decode(c)).join("")).toBe("a,b\n1,2\n");
  });

  test("terminates cleanly and closes the source when breaking out of stringifyCsvRecords early", async ({ expect }) => {
    let sourceClosed = false;
    function* source() {
      try {
        yield { id: "1", name: "Ada" };
        yield { id: "2", name: "Grace" };
        yield { id: "3", name: "Linus" };
      }
      finally {
        sourceClosed = true;
      }
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of stringifyCsvRecords(source(), { recordSeparator: "\n" })) {
      chunks.push(chunk);
      break;
    }

    expect(chunks.map(c => new TextDecoder().decode(c))).toEqual(["id,name\n"]);
    expect(sourceClosed).toBe(true);
  });

  test("propagates upstream abort across OutputCsvRecordStream and stringifyCsvRecords", async ({ expect }) => {
    const abortReason = new DOMException("Upstream aborted", "AbortError");
    const stream = new OutputCsvRecordStream({ recordSeparator: "\n" });
    const writer = stream.writable.getWriter();
    const chunks: Uint8Array[] = [];

    const reading = (async () => {
      for await (const chunk of stream.readable) {
        chunks.push(chunk);
      }
    })();

    await writer.write({ id: "1", name: "Ada" });
    await writer.abort(abortReason);

    await expect(reading).rejects.toBe(abortReason);
    expect(chunks.map(c => new TextDecoder().decode(c))).toEqual(["id,name\n", "1,Ada\n"]);

    function* failingSource() {
      yield { id: "1", name: "Ada" };
      throw abortReason;
    }

    const iterChunks: Uint8Array[] = [];
    await expect((async () => {
      for await (const chunk of stringifyCsvRecords(failingSource(), { recordSeparator: "\n" })) {
        iterChunks.push(chunk);
      }
    })()).rejects.toBe(abortReason);
    expect(iterChunks.map(c => new TextDecoder().decode(c))).toEqual(["id,name\n", "1,Ada\n"]);
  });
});
