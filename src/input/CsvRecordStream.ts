import type { OmitQueuingStrategies, QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { CsvParseStream } from "./CsvParseStream.js";
import type { CsvParseStreamOptions } from "./CsvParseStream.js";

export type CsvRecord<K extends string = string> = Record<K, string | undefined>;

export type CsvRowToRecordStreamOptions<K extends string = string> = {
  /**
   * Explicit column names. When omitted, the first incoming row is used as the header.
   */
  headers?: readonly K[]
  /**
   * Skip the first incoming row when explicit `headers` are provided (e.g. to replace an existing header row).
   * Defaults to `false`.
   */
  skipFirstRow?: boolean
} & QueuingStrategiesOptions<readonly string[], CsvRecord<K>>;

function makeInternalCsvRowToRecordStream<K extends string = string>(options: CsvRowToRecordStreamOptions<K>): {
  args: ConstructorParameters<TransformStreamConstructor<readonly string[], CsvRecord<K>>>
} {
  let headers: readonly K[] | undefined = options.headers;
  let skipFirstRow = options.skipFirstRow ?? false;
  const { writableStrategy, readableStrategy } = options;

  const args: ConstructorParameters<TransformStreamConstructor<readonly string[], CsvRecord<K>>> = [
    {
      transform(row, controller) {
        if (headers === undefined) {
          headers = [...row] as K[];
          return;
        }
        if (skipFirstRow) {
          skipFirstRow = false;
          return;
        }
        const record = {} as CsvRecord<K>;
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
 * A TransformStream that converts CSV string array rows (`readonly string[]`) into key-value record objects (`CsvRecord<K>`).
 *
 * When `options.headers` is omitted, the first incoming row is consumed as the header row.
 */
export class CsvRowToRecordStream<K extends string = string> extends TransformStream<readonly string[], CsvRecord<K>> {
  constructor(options: CsvRowToRecordStreamOptions<K> = {}) {
    const { args } = makeInternalCsvRowToRecordStream(options);
    super(...args);
  }
}

export type InputCsvRecordStreamOptions<K extends string = string> = Omit<CsvParseStreamOptions, "readableStrategy">
  & OmitQueuingStrategies<CsvRowToRecordStreamOptions<K>>
  & { readableStrategy?: QueuingStrategy<CsvRecord<K>> };

function makeInternalInputCsvRecordStream<K extends string = string>(options: InputCsvRecordStreamOptions<K>) {
  const { label, fatal, ignoreBOM, delimiter, skipHeader, skipEmptyLines, maxLength, errorFallback, headers, skipFirstRow, writableStrategy, readableStrategy } = options;
  const parser = new CsvParseStream({ label, fatal, ignoreBOM, delimiter, skipHeader, skipEmptyLines, maxLength, errorFallback, writableStrategy });
  const mapper = new CsvRowToRecordStream<K>({ headers, skipFirstRow, readableStrategy });
  const { writable } = parser;
  const readable = parser.readable.pipeThrough(mapper);
  return { writable, readable };
}

/**
 * A composite stream that parses UTF-8 byte or string chunks into key-value CSV record objects (`CsvRecord<K>`).
 */
export class InputCsvRecordStream<K extends string = string> implements ReadableWritablePair<CsvRecord<K>, Uint8Array | string> {
  #writable: WritableStream<Uint8Array | string>;
  #readable: ReadableStream<CsvRecord<K>>;
  get writable() { return this.#writable; }
  get readable() { return this.#readable; }
  constructor(options: InputCsvRecordStreamOptions<K> = {}) {
    ({
      readable: this.#readable,
      writable: this.#writable,
    } = makeInternalInputCsvRecordStream(options));
  }
}

/**
 * Parses an `AsyncIterable` or `Iterable` of UTF-8 byte or string chunks into CSV record objects (`CsvRecord<K>`).
 */
export async function* parseCsvRecords<K extends string = string>(
  source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  options?: InputCsvRecordStreamOptions<K>,
): AsyncGenerator<CsvRecord<K>, void, undefined> {
  const stream = new InputCsvRecordStream<K>(options);
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
