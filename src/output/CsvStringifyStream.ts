import type { QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { COMMA, validateDelimiter } from "../internal/validateDelimiter.js";
import { CRLF, DQUOTE } from "../rfc4180.js";

export type CsvCell = string | number | boolean | bigint | null | undefined;

export type CsvStringifyStreamOptions = {
  /** Field separator. Must be one character and cannot be a quote or line break. Defaults to `","`. */
  delimiter?: string
  /** Record separator. Defaults to CRLF (`"\r\n"`) as specified by RFC 4180. */
  recordSeparator?: "\r\n" | "\n"
  /** Prepend a UTF-8 BOM (`0xEF 0xBB 0xBF`) to the output stream (useful for opening UTF-8 CSV files in Excel). Defaults to `false`. */
  bom?: boolean
} & QueuingStrategiesOptions<readonly CsvCell[], Uint8Array>;

function makeInternalCsvStringifyStream(options: CsvStringifyStreamOptions): {
  args: ConstructorParameters<TransformStreamConstructor<readonly CsvCell[], Uint8Array>>
} {
  const delimiter = options.delimiter ?? COMMA;
  const recordSeparator = options.recordSeparator ?? CRLF;
  const bom = options.bom ?? false;
  const { writableStrategy, readableStrategy } = options;
  validateDelimiter(delimiter);
  const encoder = new TextEncoder();

  const args: ConstructorParameters<TransformStreamConstructor<readonly CsvCell[], Uint8Array>> = [
    {
      start(controller) {
        if (bom) {
          controller.enqueue(new Uint8Array([0xEF, 0xBB, 0xBF]));
        }
      },
      transform(row, controller) {
        const output = row.map((value) => {
          const text = value == null ? "" : String(value);
          if (!text.includes(delimiter) && !text.includes(DQUOTE) && !/[\r\n]/u.test(text)) {
            return text;
          }
          return `${DQUOTE}${text.replaceAll(DQUOTE, `${DQUOTE}${DQUOTE}`)}${DQUOTE}`;
        }).join(delimiter);
        controller.enqueue(encoder.encode(output + recordSeparator));
      },
    },
    writableStrategy,
    readableStrategy,
  ];
  return { args };
}

/**
 * Serializes rows of primitive values to UTF-8 CSV bytes. Values containing a delimiter, quote,
 * or line break are quoted, and quotes inside quoted fields are doubled.
 */
export class CsvStringifyStream extends TransformStream<readonly CsvCell[], Uint8Array> {
  constructor(options: CsvStringifyStreamOptions = {}) {
    const { args } = makeInternalCsvStringifyStream(options);
    super(...args);
  }
}

/**
 * Serializes an `AsyncIterable` or `Iterable` of CSV rows (`readonly CsvCell[]`) into UTF-8 CSV byte chunks.
 */
export async function* stringifyCsv(
  source: AsyncIterable<readonly CsvCell[]> | Iterable<readonly CsvCell[]>,
  options?: CsvStringifyStreamOptions,
): AsyncGenerator<Uint8Array, void, undefined> {
  const stream = new CsvStringifyStream(options);
  const writer = stream.writable.getWriter();
  const writePromise = (async () => {
    for await (const row of source) {
      await writer.write(row);
    }
    await writer.close();
  })();
  yield* stream.readable;
  await writePromise;
}
