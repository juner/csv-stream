import { COMMA, MIME_TYPE as CSV_MIME_TYPE, TAB, TSV_MIME_TYPE } from "../rfc4180.js";
import { CsvParseStream } from "./CsvParseStream.js";
import type { CsvParseStreamOptions } from "./CsvParseStream.js";

/** Supported streaming delimited formats. */
export type CsvStreamFormat = "csv" | "tsv";

export type ParseCsvResponseOptions = {
  /** Explicit format. When set, `Content-Type` detection is skipped. */
  format?: CsvStreamFormat
} & CsvParseStreamOptions;

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
 * Parses a `fetch()` `Response` containing a CSV or TSV body into a `ReadableStream` of rows (`string[]`),
 * selecting the default delimiter and character encoding (`charset`) from the response's `Content-Type` header
 * unless explicitly overridden in `options`.
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
  const stream = new CsvParseStream({ ...options, delimiter, label });
  return response.body.pipeThrough(stream);
}
