import type { QueuingStrategiesOptions, TransformStreamConstructor } from "../types/index.js";
import { pipeIterable } from "../internal/pipeIterable.js";
import { COMMA, validateDelimiter } from "../internal/validateDelimiter.js";
import { CR, DQUOTE, LF } from "../rfc4180.js";

export type CsvParseErrorFallback = false | ((
  error: unknown,
  args: {
    error: (reason: unknown) => void
    row: string[]
    field: string
    enqueue: (row: string[]) => void
  },
) => void);

export type CsvParseStreamOptions = {
  /** Text encoding label passed to `TextDecoder` (e.g. `"utf-8"`, `"shift_jis"`, `"euc-jp"`). Defaults to `"utf-8"`. */
  label?: string
  /** Field separator. Must be one character and cannot be a quote or line break. Defaults to `","`. */
  delimiter?: string
  /** Skip the first parsed row (header row). Defaults to `false`. */
  skipHeader?: boolean
  /** Skip completely empty lines (lines with no characters between line breaks). Defaults to `false`. */
  skipEmptyLines?: boolean
  /** Maximum allowed character length for a single field or row. Errors with `RangeError` when exceeded. */
  maxLength?: number
  /**
   * Handles syntax errors in malformed CSV records.
   * - `undefined` (default): throws `SyntaxError` and errors the stream.
   * - `false`: skips the malformed record silently and recovers at the next line break.
   * - function: called with the error and helper methods (`enqueue`, `error`) to control recovery.
   */
  errorFallback?: CsvParseErrorFallback
} & TextDecoderOptions & QueuingStrategiesOptions<Uint8Array | string, string[]>;

function handleError(
  err: unknown,
  errorFallback: CsvParseErrorFallback | undefined,
  controller: TransformStreamDefaultController<string[]>,
  row: string[],
  field: string,
): void {
  if (errorFallback === undefined) {
    throw err;
  }
  if (errorFallback === false) {
    return;
  }
  errorFallback(err, {
    error: controller.error.bind(controller),
    row,
    field,
    enqueue: controller.enqueue.bind(controller),
  });
}

function makeInternalCsvParseStream(options: CsvParseStreamOptions): {
  args: ConstructorParameters<TransformStreamConstructor<Uint8Array | string, string[]>>
} {
  const delimiter = options.delimiter ?? COMMA;
  const skipEmptyLines = options.skipEmptyLines ?? false;
  let skipHeader = options.skipHeader ?? false;
  const { label, fatal, ignoreBOM, maxLength, errorFallback, writableStrategy, readableStrategy } = options;
  validateDelimiter(delimiter);

  const decoder = new TextDecoder(label, { fatal, ignoreBOM });
  let field = "";
  let row: string[] = [];
  let rowLength = 0;
  let inQuotes = false;
  let afterQuote = false;
  let skipLineFeed = false;
  let skippingMalformedRow = false;
  let hasData = false;
  let firstCharacter = true;

  const resetRow = () => {
    field = "";
    row = [];
    rowLength = 0;
    inQuotes = false;
    afterQuote = false;
    hasData = false;
  };

  const emitRow = (controller: TransformStreamDefaultController<string[]>) => {
    if (skipEmptyLines && !hasData && row.length === 0 && field.length === 0) {
      resetRow();
      return;
    }
    if (skipHeader) {
      skipHeader = false;
      resetRow();
      return;
    }
    row.push(field);
    controller.enqueue(row);
    resetRow();
  };

  const checkMaxLength = (addedLength: number) => {
    if (maxLength !== undefined && rowLength + field.length + addedLength > maxLength) {
      resetRow();
      throw new RangeError(`Maximum length (${maxLength}) exceeded`);
    }
  };

  const parse = (input: string, controller: TransformStreamDefaultController<string[]>) => {
    let startIndex = 0;
    if (firstCharacter && input.length > 0) {
      firstCharacter = false;
      if (!ignoreBOM && input[0] === "\uFEFF") {
        startIndex = 1;
      }
    }
    for (let index = startIndex; index < input.length; index++) {
      const character = input[index];

      if (skipLineFeed) {
        skipLineFeed = false;
        if (character === LF) continue;
      }

      if (skippingMalformedRow) {
        if (character === CR || character === LF) {
          skippingMalformedRow = false;
          skipLineFeed = character === CR;
        }
        continue;
      }

      if (inQuotes) {
        if (character === DQUOTE) {
          inQuotes = false;
          afterQuote = true;
        }
        else {
          const nextQuote = input.indexOf(DQUOTE, index);
          const end = nextQuote === -1 ? input.length : nextQuote;
          const slice = input.slice(index, end);
          checkMaxLength(slice.length);
          field += slice;
          index = end - 1;
        }
        hasData = true;
        continue;
      }

      if (afterQuote) {
        if (character === DQUOTE) {
          checkMaxLength(1);
          field += DQUOTE;
          inQuotes = true;
          afterQuote = false;
          hasData = true;
          continue;
        }
        if (character !== delimiter && character !== CR && character !== LF) {
          const snapshotRow = [...row];
          const snapshotField = field;
          resetRow();
          skippingMalformedRow = true;
          handleError(
            new SyntaxError("Unexpected character after a quoted CSV field"),
            errorFallback,
            controller,
            snapshotRow,
            snapshotField,
          );
          continue;
        }
        afterQuote = false;
      }

      if (character === delimiter) {
        rowLength += field.length;
        row.push(field);
        field = "";
        hasData = true;
      }
      else if (character === CR || character === LF) {
        emitRow(controller);
        skipLineFeed = character === CR;
      }
      else if (character === DQUOTE && field.length === 0) {
        inQuotes = true;
        hasData = true;
      }
      else if (character === DQUOTE) {
        const snapshotRow = [...row];
        const snapshotField = field;
        resetRow();
        skippingMalformedRow = true;
        handleError(
          new SyntaxError("Unexpected quote in an unquoted CSV field"),
          errorFallback,
          controller,
          snapshotRow,
          snapshotField,
        );
      }
      else {
        checkMaxLength(1);
        field += character;
        hasData = true;
      }
    }
  };

  const args: ConstructorParameters<TransformStreamConstructor<Uint8Array | string, string[]>> = [
    {
      transform(chunk, controller) {
        parse(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }), controller);
      },
      flush(controller) {
        parse(decoder.decode(), controller);
        if (skippingMalformedRow) {
          skippingMalformedRow = false;
          return;
        }
        if (inQuotes) {
          const snapshotRow = [...row];
          const snapshotField = field;
          resetRow();
          handleError(
            new SyntaxError("Unterminated quoted CSV field"),
            errorFallback,
            controller,
            snapshotRow,
            snapshotField,
          );
          return;
        }
        if (hasData || row.length > 0 || field.length > 0) {
          emitRow(controller);
        }
      },
    },
    writableStrategy,
    readableStrategy,
  ];
  return { args };
}

/**
 * Parses UTF-8 bytes or strings into CSV rows (`string[]`). Quoted fields may contain delimiters and line breaks;
 * doubled quotes inside quoted fields are unescaped. Malformed quoting errors the stream unless `errorFallback` is set.
 */
export class CsvParseStream extends TransformStream<Uint8Array | string, string[]> {
  constructor(options: CsvParseStreamOptions = {}) {
    const { args } = makeInternalCsvParseStream(options);
    super(...args);
  }
}

/**
 * Parses an `AsyncIterable` or `Iterable` of UTF-8 byte or string chunks into CSV rows (`string[]`).
 */
export async function* parseCsv(
  source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
  options?: CsvParseStreamOptions,
): AsyncGenerator<string[], void, undefined> {
  yield* pipeIterable(source, new CsvParseStream(options));
}
