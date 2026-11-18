import { COMMA, HEADER_ABSENT, HEADER_PRESENT, MIME_TYPE as CSV_MIME_TYPE, TAB, TSV_MIME_TYPE } from "../rfc4180.js";
import { CsvParseStream } from "./CsvParseStream.js";
import type { CsvParseStreamOptions } from "./CsvParseStream.js";
import { InputCsvRecordStream } from "./CsvRecordStream.js";
import type { CsvRecord, InputCsvRecordStreamOptions } from "./CsvRecordStream.js";

/** Supported streaming delimited formats. */
export type CsvStreamFormat = "csv" | "tsv";

/** RFC 4180 `header` parameter values (`"present"` or `"absent"`). */
export type CsvHeaderParameter = typeof HEADER_PRESENT | typeof HEADER_ABSENT;

export type ParseCsvResponseOptions = {
  /** Explicit format. When set, `Content-Type` detection is skipped. */
  format?: CsvStreamFormat
} & CsvParseStreamOptions;

export type ParseCsvRecordResponseOptions = {
  /** Explicit format. When set, `Content-Type` detection is skipped. */
  format?: CsvStreamFormat
} & InputCsvRecordStreamOptions;

/**
 * Detects the delimited text format from a `Content-Type` header value.
 *
 * - `text/csv` / `application/csv` -> `"csv"` (RFC 4180)
 * - `text/tab-separated-values` / `text/tsv` -> `"tsv"`
 * - anything else (or `null`) -> `undefined`
 */
export function detectCsvStreamFormat(contentType: string | null): CsvStreamFormat | undefined {
  if (contentType === null) return undefined;
  const separatorIndex = contentType.indexOf(";");
  const mime = (separatorIndex < 0 ? contentType : contentType.slice(0, separatorIndex)).trim().toLowerCase();
  switch (mime) {
    case CSV_MIME_TYPE:
    case "application/csv":
      return "csv";
    case TSV_MIME_TYPE:
    case "text/tsv":
      return "tsv";
    default:
      return undefined;
  }
}

/**
 * Extracts the `charset` parameter from a `Content-Type` header value, if present.
 *
 * Examples:
 * - `"text/csv; charset=Shift_JIS"` -> `"Shift_JIS"`
 * - `"text/csv; charset=\"utf-8\""` -> `"utf-8"`
 * - `"text/csv"` or `null` -> `undefined`
 */
export function detectCsvCharset(contentType: string | null): string | undefined {
  if (contentType === null) return undefined;
  const match = /;\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu.exec(contentType);
  return match?.[1] ?? match?.[2];
}

/**
 * Extracts the RFC 4180 `header` parameter (`"present"` or `"absent"`) from a `Content-Type` header value.
 *
 * Examples:
 * - `"text/csv; header=present"` -> `"present"`
 * - `"text/csv; header=absent"` -> `"absent"`
 * - `"text/csv; header=\"PRESENT\""` -> `"present"`
 * - `"text/csv"` or unknown value -> `undefined`
 */
export function detectCsvHeader(contentType: string | null): CsvHeaderParameter | undefined {
  if (contentType === null) return undefined;
  const match = /;\s*header\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu.exec(contentType);
  const raw = (match?.[1] ?? match?.[2])?.toLowerCase();
  if (raw === HEADER_PRESENT || raw === HEADER_ABSENT) {
    return raw;
  }
  return undefined;
}

/**
 * Parses a `fetch()` `Response` containing a CSV or TSV body into a `ReadableStream` of rows (`string[]`),
 * selecting the default delimiter, `charset`, and `header` handling from the response's `Content-Type` header
 * unless explicitly overridden in `options`.
 *
 * When `Content-Type` includes `header=present`, the first row (header row) is skipped by default unless
 * `options.skipHeader` is explicitly set to `false`.
 *
 * @throws TypeError when the format cannot be detected or the response has no body.
 */
export function parseCsvResponse(response: Response, options?: ParseCsvResponseOptions): ReadableStream<string[]> {
  const contentType = response.headers.get("content-type");
  const format = options?.format ?? detectCsvStreamFormat(contentType);
  if (format === undefined) {
    throw new TypeError(`csv-stream: cannot detect a CSV/TSV format from content-type ${JSON.stringify(contentType)}; pass the format option to parse it anyway.`);
  }
  if (response.body === null) {
    throw new TypeError("csv-stream: the response has no body.");
  }
  const delimiter = options?.delimiter ?? (format === "tsv" ? TAB : COMMA);
  const label = options?.label ?? detectCsvCharset(contentType);
  const headerParam = detectCsvHeader(contentType);
  const skipHeader = options?.skipHeader ?? (headerParam === HEADER_PRESENT);
  const stream = new CsvParseStream({ ...options, delimiter, label, skipHeader });
  return response.body.pipeThrough(stream);
}

/**
 * Parses a `fetch()` `Response` containing a CSV or TSV body into a `ReadableStream` of key-value record objects (`CsvRecord`),
 * respecting the `Content-Type` `charset` and RFC 4180 `header` (`present` / `absent`) parameters.
 *
 * - If `header=absent` is present in `Content-Type` and `options.headers` is not provided, throws a `TypeError`
 *   to prevent consuming the first data row as column headers.
 * - If `header=present` is present in `Content-Type` and `options.headers` is explicitly provided, the original
 *   header row in the stream is automatically skipped (`skipFirstRow: true`) unless overridden.
 *
 * @throws TypeError when the format cannot be detected, `header=absent` is set without `options.headers`, or the response has no body.
 */
export function parseCsvRecordResponse(response: Response, options?: ParseCsvRecordResponseOptions): ReadableStream<CsvRecord> {
  const contentType = response.headers.get("content-type");
  const format = options?.format ?? detectCsvStreamFormat(contentType);
  if (format === undefined) {
    throw new TypeError(`csv-stream: cannot detect a CSV/TSV format from content-type ${JSON.stringify(contentType)}; pass the format option to parse it anyway.`);
  }
  if (response.body === null) {
    throw new TypeError("csv-stream: the response has no body.");
  }
  const headerParam = detectCsvHeader(contentType);
  if (headerParam === HEADER_ABSENT && options?.headers === undefined) {
    throw new TypeError("csv-stream: content-type specifies header=absent; pass the headers option to map rows into records.");
  }
  const delimiter = options?.delimiter ?? (format === "tsv" ? TAB : COMMA);
  const label = options?.label ?? detectCsvCharset(contentType);
  const skipFirstRow = options?.skipFirstRow ?? (headerParam === HEADER_PRESENT && options?.headers !== undefined);
  const stream = new InputCsvRecordStream({ ...options, delimiter, label, skipFirstRow });
  return response.body.pipeThrough(stream);
}
