import type { OmitQueuingStrategies, QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { CsvStringifyStream } from "./CsvStringifyStream.js";
import type { CsvCell, CsvStringifyStreamOptions } from "./CsvStringifyStream.js";

export type CsvInputRecord = Readonly<Record<string, CsvCell>>;

export type CsvRecordToRowStreamOptions = {
  /**
   * Explicit column order. When omitted, the keys of the first incoming record determine the columns.
   */
  headers?: readonly string[]
  /**
   * Whether to emit the header row before the first data row. Defaults to `true`.
   */
  includeHeader?: boolean
} & QueuingStrategiesOptions<CsvInputRecord, CsvCell[]>;

function makeInternalCsvRecordToRowStream(options: CsvRecordToRowStreamOptions): {
  args: ConstructorParameters<TransformStreamConstructor<CsvInputRecord, CsvCell[]>>
} {
  let headers: readonly string[] | undefined = options.headers;
  let headerEmitted = !(options.includeHeader ?? true);
  const { writableStrategy, readableStrategy } = options;

  const args: ConstructorParameters<TransformStreamConstructor<CsvInputRecord, CsvCell[]>> = [
    {
      start(controller) {
        if (headers !== undefined && !headerEmitted) {
          controller.enqueue([...headers]);
          headerEmitted = true;
        }
      },
      transform(record, controller) {
        if (headers === undefined) {
          headers = Object.keys(record);
        }
        if (!headerEmitted) {
          controller.enqueue([...headers]);
          headerEmitted = true;
        }
        controller.enqueue(headers.map(key => record[key]));
      },
    },
    writableStrategy,
    readableStrategy,
  ];
  return { args };
}

/**
 * A TransformStream that converts key-value record objects (`CsvInputRecord`) into CSV row arrays (`CsvCell[]`).
 */
export class CsvRecordToRowStream extends TransformStream<CsvInputRecord, CsvCell[]> {
  constructor(options: CsvRecordToRowStreamOptions = {}) {
    const { args } = makeInternalCsvRecordToRowStream(options);
    super(...args);
  }
}

export type OutputCsvRecordStreamOptions = Omit<CsvStringifyStreamOptions, "writableStrategy">
  & OmitQueuingStrategies<CsvRecordToRowStreamOptions>
  & { writableStrategy?: QueuingStrategy<CsvInputRecord> };

function makeInternalOutputCsvRecordStream(options: OutputCsvRecordStreamOptions) {
  const { delimiter, recordSeparator, headers, includeHeader, writableStrategy, readableStrategy } = options;
  const mapper = new CsvRecordToRowStream({ headers, includeHeader, writableStrategy });
  const stringifier = new CsvStringifyStream({ delimiter, recordSeparator, readableStrategy });
  const { writable } = mapper;
  const readable = mapper.readable.pipeThrough(stringifier);
  return { writable, readable };
}

/**
 * A composite stream that serializes key-value record objects (`CsvInputRecord`) into UTF-8 CSV byte chunks.
 */
export class OutputCsvRecordStream implements ReadableWritablePair<Uint8Array, CsvInputRecord> {
  #writable: WritableStream<CsvInputRecord>;
  #readable: ReadableStream<Uint8Array>;
  get writable() { return this.#writable; }
  get readable() { return this.#readable; }
  constructor(options: OutputCsvRecordStreamOptions = {}) {
    ({
      readable: this.#readable,
      writable: this.#writable,
    } = makeInternalOutputCsvRecordStream(options));
  }
}

/**
 * Serializes an `AsyncIterable` or `Iterable` of key-value record objects (`CsvInputRecord`) into UTF-8 CSV byte chunks.
 */
export async function* stringifyCsvRecords(
  source: AsyncIterable<CsvInputRecord> | Iterable<CsvInputRecord>,
  options?: OutputCsvRecordStreamOptions,
): AsyncGenerator<Uint8Array, void, undefined> {
  const stream = new OutputCsvRecordStream(options);
  const writer = stream.writable.getWriter();
  const writePromise = (async () => {
    for await (const record of source) {
      await writer.write(record);
    }
    await writer.close();
  })();
  yield* stream.readable;
  await writePromise;
}
