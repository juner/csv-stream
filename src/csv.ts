export type CsvParseStreamOptions = {
  /** Field separator. Must be one character and cannot be a quote or line break. */
  delimiter?: string
  writableStrategy?: QueuingStrategy<Uint8Array | string>
  readableStrategy?: QueuingStrategy<string[]>
};

export type CsvCell = string | number | boolean | bigint | null | undefined;

export type CsvStringifyStreamOptions = {
  /** Field separator. Must be one character and cannot be a quote or line break. */
  delimiter?: string
  /** Record separator. Defaults to CRLF as specified by RFC 4180. */
  recordSeparator?: "\r\n" | "\n"
  writableStrategy?: QueuingStrategy<readonly CsvCell[]>
  readableStrategy?: QueuingStrategy<Uint8Array>
};

function validateDelimiter(delimiter: string): void {
  if (delimiter.length !== 1 || delimiter === `"` || delimiter === "\r" || delimiter === "\n") {
    throw new RangeError("delimiter must be one character other than a quote or line break");
  }
}

/**
 * Parses UTF-8 bytes or strings into CSV rows. Quoted fields may contain delimiters and line breaks;
 * doubled quotes inside quoted fields are unescaped. Malformed quoting errors the stream.
 */
export class CsvParseStream extends TransformStream<Uint8Array | string, string[]> {
  constructor(options: CsvParseStreamOptions = {}) {
    const delimiter = options.delimiter ?? ",";
    validateDelimiter(delimiter);

    const decoder = new TextDecoder();
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    let afterQuote = false;
    let skipLineFeed = false;
    let hasData = false;
    let firstCharacter = true;

    const emitRow = (controller: TransformStreamDefaultController<string[]>) => {
      row.push(field);
      controller.enqueue(row);
      field = "";
      row = [];
      hasData = false;
    };

    const parse = (input: string, controller: TransformStreamDefaultController<string[]>) => {
      for (let index = 0; index < input.length; index++) {
        const character = input[index];
        if (firstCharacter) {
          firstCharacter = false;
          if (character === "\uFEFF") continue;
        }

        if (skipLineFeed) {
          skipLineFeed = false;
          if (character === "\n") continue;
        }

        if (inQuotes) {
          if (character === `"`) {
            inQuotes = false;
            afterQuote = true;
          }
          else {
            field += character;
          }
          hasData = true;
          continue;
        }

        if (afterQuote) {
          if (character === `"`) {
            field += `"`;
            inQuotes = true;
            afterQuote = false;
            hasData = true;
            continue;
          }
          if (character !== delimiter && character !== "\r" && character !== "\n") {
            throw new SyntaxError("Unexpected character after a quoted CSV field");
          }
          afterQuote = false;
        }

        if (character === delimiter) {
          row.push(field);
          field = "";
          hasData = true;
        }
        else if (character === "\r" || character === "\n") {
          emitRow(controller);
          skipLineFeed = character === "\r";
        }
        else if (character === `"` && field.length === 0) {
          inQuotes = true;
          hasData = true;
        }
        else if (character === `"`) {
          throw new SyntaxError("Unexpected quote in an unquoted CSV field");
        }
        else {
          field += character;
          hasData = true;
        }
      }
    };

    super({
      transform(chunk, controller) {
        parse(typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true }), controller);
      },
      flush(controller) {
        parse(decoder.decode(), controller);
        if (inQuotes) throw new SyntaxError("Unterminated quoted CSV field");
        if (hasData || row.length > 0 || field.length > 0) emitRow(controller);
      },
    }, options.writableStrategy, options.readableStrategy);
  }
}

/**
 * Serializes rows of primitive values to UTF-8 CSV bytes. Values containing a delimiter, quote,
 * or line break are quoted, and quotes inside quoted fields are doubled.
 */
export class CsvStringifyStream extends TransformStream<readonly CsvCell[], Uint8Array> {
  constructor(options: CsvStringifyStreamOptions = {}) {
    const delimiter = options.delimiter ?? ",";
    const recordSeparator = options.recordSeparator ?? "\r\n";
    validateDelimiter(delimiter);
    const encoder = new TextEncoder();

    super({
      transform(row, controller) {
        const output = row.map((value) => {
          const text = value == null ? "" : String(value);
          if (!text.includes(delimiter) && !text.includes(`"`) && !/[\r\n]/u.test(text)) {
            return text;
          }
          return `"${text.replaceAll(`"`, `""`)}"`;
        }).join(delimiter);
        controller.enqueue(encoder.encode(output + recordSeparator));
      },
    }, options.writableStrategy, options.readableStrategy);
  }
}
