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
});
