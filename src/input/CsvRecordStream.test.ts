import { describe, expectTypeOf, test } from "vitest";
import { CsvRowToRecordStream, InputCsvRecordStream, parseCsvRecords } from "./CsvRecordStream.js";
import type { CsvRecord } from "./CsvRecordStream.js";

describe("CsvRowToRecordStream", () => {
  test("uses the first row as headers by default", async ({ expect }) => {
    const stream = new CsvRowToRecordStream();
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write(["id", "name"]);
      await writer.write(["1", "Ada"]);
      await writer.write(["2"]);
      await writer.close();
    })();
    const records = await Array.fromAsync(stream.readable);
    await writing;

    expect(records).toEqual([
      { id: "1", name: "Ada" },
      { id: "2", name: undefined },
    ]);
  });

  test("uses explicit headers when provided, optionally skipping the first row", async ({ expect }) => {
    const stream = new CsvRowToRecordStream({ headers: ["colA", "colB"] });
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write(["val1", "val2"]);
      await writer.close();
    })();
    const records = await Array.fromAsync(stream.readable);
    await writing;

    expectTypeOf(records).toEqualTypeOf<CsvRecord<"colA" | "colB">[]>();
    expect(records).toEqual([{ colA: "val1", colB: "val2" }]);

    const skipStream = new CsvRowToRecordStream({ headers: ["colA", "colB"], skipFirstRow: true });
    const skipWriter = skipStream.writable.getWriter();
    const skipWriting = (async () => {
      await skipWriter.write(["oldA", "oldB"]);
      await skipWriter.write(["val1", "val2"]);
      await skipWriter.close();
    })();
    const skipRecords = await Array.fromAsync(skipStream.readable);
    await skipWriting;

    expect(skipRecords).toEqual([{ colA: "val1", colB: "val2" }]);
  });
});

describe("InputCsvRecordStream and parseCsvRecords", () => {
  test("parses CSV text into record objects", async ({ expect }) => {
    const records = await Array.fromAsync(parseCsvRecords<"id" | "name">([
      "id,name\r\n",
      "1,Ada\r\n2,Grace",
    ]));

    expectTypeOf(records).toEqualTypeOf<CsvRecord<"id" | "name">[]>();
    expect(records).toEqual([
      { id: "1", name: "Ada" },
      { id: "2", name: "Grace" },
    ]);
  });

  test("works with pipeThrough on InputCsvRecordStream", async ({ expect }) => {
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("a;b\n10;20");
        controller.close();
      },
    });
    const stream = new InputCsvRecordStream({ delimiter: ";" });
    const records = await Array.fromAsync(source.pipeThrough(stream));

    expect(records).toEqual([{ a: "10", b: "20" }]);
  });

  test("terminates cleanly and closes the source when breaking out of parseCsvRecords early", async ({ expect }) => {
    let sourceClosed = false;
    function* source() {
      try {
        yield "id,name\n";
        yield "1,Ada\n";
        yield "2,Grace\n";
        yield "3,Linus\n";
      }
      finally {
        sourceClosed = true;
      }
    }

    const records: CsvRecord<"id" | "name">[] = [];
    for await (const record of parseCsvRecords<"id" | "name">(source())) {
      records.push(record);
      break;
    }

    expect(records).toEqual([{ id: "1", name: "Ada" }]);
    expect(sourceClosed).toBe(true);
  });

  test("propagates upstream abort across InputCsvRecordStream and parseCsvRecords", async ({ expect }) => {
    const abortReason = new DOMException("Upstream aborted", "AbortError");
    const stream = new InputCsvRecordStream();
    const writer = stream.writable.getWriter();
    const records: CsvRecord[] = [];

    const reading = (async () => {
      for await (const record of stream.readable) {
        records.push(record);
      }
    })();

    await writer.write("id,name\n1,Ada\n\"unterminated");
    await writer.abort(abortReason);

    await expect(reading).rejects.toBe(abortReason);
    expect(records).toEqual([{ id: "1", name: "Ada" }]);

    function* failingSource() {
      yield "id,name\n1,Ada\n";
      throw abortReason;
    }

    const iterRecords: CsvRecord[] = [];
    await expect((async () => {
      for await (const record of parseCsvRecords(failingSource())) {
        iterRecords.push(record);
      }
    })()).rejects.toBe(abortReason);
    expect(iterRecords).toEqual([{ id: "1", name: "Ada" }]);
  });
});
