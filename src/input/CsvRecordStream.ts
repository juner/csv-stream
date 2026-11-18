import type { OmitQueuingStrategies, QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { CsvParseStream } from "./CsvParseStream.js";
import type { CsvParseStreamOptions } from "./CsvParseStream.js";

export type CsvRecord = Record<string, string | undefined>;

export type CsvRowToRecordStreamOptions = {
  /**
   * Explicit column names. When omitted or `true`, the first incoming row is used as the header.
   */
  headers?: readonly string[]
} & QueuingStrategiesOptions<readonly string[], CsvRecord>;

function makeInternalCsvRowToRecordStream(options: CsvRowToRecordStreamOptions): {
  args: ConstructorParameters<TransformStreamConstructor<readonly string[], CsvRecord>>
} {
  let headers: readonly string[] | undefined = options.headers;
  const { writableStrategy, readableStrategy } = options;

  const args: ConstructorParameters<TransformStreamConstructor<readonly string[], CsvRecord>> = [
    {
      transform(row, controller) {
        if (headers === undefined) {
          headers = [...row];
          return;
        }
        const record: CsvRecord = {};
        for (let i = 0; i < headers.length; i++) {
          record[headers[i]] = row[i];
        }
        controller.enqueue(record);
      },
    },
    writableStrategy,
    readableStrategy,
  ];
  return { args };
}

/**
 * A TransformStream that converts CSV string array rows (`readonly string[]`) into key-value record objects.
 *
 * When `options.headers` is omitted, the first incoming row is consumed as the header row.
 */
export class CsvRowToRecordStream extends TransformStream<readonly string[], CsvRecord> {
  constructor(options: CsvRowToRecordStreamOptions = {}) {
    const { args } = makeInternalCsvRowToRecordStream(options);
    super(...args);
  }
}

export type InputCsvRecordStreamOptions = Omit<CsvParseStreamOptions, "readableStrategy">
  & OmitQueuingStrategies<CsvRowToRecordStreamOptions>
  & { readableStrategy?: QueuingStrategy<CsvRecord> };

function makeInternalInputCsvRecordStream(options: InputCsvRecordStreamOptions) {
  const { delimiter, skipEmptyLines, maxLength, errorFallback, headers, writableStrategy, readableStrategy } = options;
  const parser = new CsvParseStream({ delimiter, skipEmptyLines, maxLength, errorFallback, writableStrategy });
  const mapper = new CsvRowToRecordStream({ headers, readableStrategy });
  const { writable } = parser;
  const readable = parser.readable.pipeThrough(mapper);
  return { writable, readable };
}

/**
 * A composite stream that parses UTF-8 byte or string chunks into key-value CSV record objects (`CsvRecord`).
 */
export class InputCsvRecordStream implements ReadableWritablePair<CsvRecord, Uint8Array | string> {
  #writable: WritableStream<Uint8Array | string>;
  #readable: ReadableStream<CsvRecord>;
  get writable() { return this.#writable; }
  get readable() { return this.#readable; }
  constructor(options: InputCsvRecordStreamOptions = {}) {
    ({
      readable: this.#readable,
      writable: this.#writable,
    } = makeInternalInputCsvRecordStream(options));
  }
}

/**
 * Parses an `AsyncIterable` or `Iterable` of UTF-8 byte or string chunks into CSV record objects (`CsvRecord`).
 */
export async function* parseCsvRecords(
  source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  options?: InputCsvRecordStreamOptions,
): AsyncGenerator<CsvRecord, void, undefined> {
  const stream = new InputCsvRecordStream(options);
  const writer = stream.writable.getWriter();
  const writePromise = (async () => {
    for await (const chunk of source) {
      await writer.write(chunk);
    }
    await writer.close();
  })();
  yield* stream.readable;
  await writePromise;
}
