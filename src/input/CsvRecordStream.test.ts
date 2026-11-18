import { describe, test } from "vitest";
import { CsvRowToRecordStream, InputCsvRecordStream, parseCsvRecords } from "./CsvRecordStream.js";

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

  test("uses explicit headers when provided", async ({ expect }) => {
    const stream = new CsvRowToRecordStream({ headers: ["colA", "colB"] });
    const writer = stream.writable.getWriter();
    const writing = (async () => {
      await writer.write(["val1", "val2"]);
      await writer.close();
    })();
    const records = await Array.fromAsync(stream.readable);
    await writing;

    expect(records).toEqual([{ colA: "val1", colB: "val2" }]);
  });
});

describe("InputCsvRecordStream and parseCsvRecords", () => {
  test("parses CSV text into record objects", async ({ expect }) => {
    const records = await Array.fromAsync(parseCsvRecords([
      "id,name\r\n",
      "1,Ada\r\n2,Grace",
    ]));

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
});
