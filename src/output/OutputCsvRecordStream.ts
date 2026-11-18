import type { OmitQueuingStrategies, QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { CsvStringifyStream } from "./CsvStringifyStream.js";
import type { CsvCell, CsvStringifyStreamOptions } from "./CsvStringifyStream.js";

export type CsvInputRecord<K extends string = string> = Readonly<Record<K, CsvCell>>;

export type CsvRecordToRowStreamOptions<K extends string = string> = {
  /**
   * Explicit column order. When omitted, the keys of the first incoming record determine the columns.
   */
  headers?: readonly K[]
  /**
   * Whether to emit the header row before the first data row. Defaults to `true`.
   */
  includeHeader?: boolean
} & QueuingStrategiesOptions<CsvInputRecord<K>, CsvCell[]>;

function makeInternalCsvRecordToRowStream<K extends string = string>(options: CsvRecordToRowStreamOptions<K>): {
  args: ConstructorParameters<TransformStreamConstructor<CsvInputRecord<K>, CsvCell[]>>
} {
  let headers: readonly K[] | undefined = options.headers;
  let headerEmitted = !(options.includeHeader ?? true);
  const { writableStrategy, readableStrategy } = options;

  const args: ConstructorParameters<TransformStreamConstructor<CsvInputRecord<K>, CsvCell[]>> = [
    {
      start(controller) {
        if (headers !== undefined && !headerEmitted) {
          controller.enqueue([...headers]);
          headerEmitted = true;
        }
      },
      transform(record, controller) {
        if (headers === undefined) {
          headers = Object.keys(record) as K[];
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
 * A TransformStream that converts key-value record objects (`CsvInputRecord<K>`) into CSV row arrays (`CsvCell[]`).
 */
export class CsvRecordToRowStream<K extends string = string> extends TransformStream<CsvInputRecord<K>, CsvCell[]> {
  constructor(options: CsvRecordToRowStreamOptions<K> = {}) {
    const { args } = makeInternalCsvRecordToRowStream(options);
    super(...args);
  }
}

export type OutputCsvRecordStreamOptions<K extends string = string> = Omit<CsvStringifyStreamOptions, "writableStrategy">
  & OmitQueuingStrategies<CsvRecordToRowStreamOptions<K>>
  & { writableStrategy?: QueuingStrategy<CsvInputRecord<K>> };

function makeInternalOutputCsvRecordStream<K extends string = string>(options: OutputCsvRecordStreamOptions<K>) {
  const { delimiter, recordSeparator, bom, headers, includeHeader, writableStrategy, readableStrategy } = options;
  const mapper = new CsvRecordToRowStream<K>({ headers, includeHeader, writableStrategy });
  const stringifier = new CsvStringifyStream({ delimiter, recordSeparator, bom, readableStrategy });
  const { writable } = mapper;
  const readable = mapper.readable.pipeThrough(stringifier);
  return { writable, readable };
}

/**
 * A composite stream that serializes key-value record objects (`CsvInputRecord<K>`) into UTF-8 CSV byte chunks.
 */
export class OutputCsvRecordStream<K extends string = string> implements ReadableWritablePair<Uint8Array, CsvInputRecord<K>> {
  #writable: WritableStream<CsvInputRecord<K>>;
  #readable: ReadableStream<Uint8Array>;
  get writable() { return this.#writable; }
  get readable() { return this.#readable; }
  constructor(options: OutputCsvRecordStreamOptions<K> = {}) {
    ({
      readable: this.#readable,
      writable: this.#writable,
    } = makeInternalOutputCsvRecordStream(options));
  }
}

/**
 * Serializes an `AsyncIterable` or `Iterable` of key-value record objects (`CsvInputRecord<K>`) into UTF-8 CSV byte chunks.
 */
export async function* stringifyCsvRecords<K extends string = string>(
  source: AsyncIterable<CsvInputRecord<K>> | Iterable<CsvInputRecord<K>>,
  options?: OutputCsvRecordStreamOptions<K>,
): AsyncGenerator<Uint8Array, void, undefined> {
  const stream = new OutputCsvRecordStream<K>(options);
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
