/**
 * Common Format and MIME Type for Comma-Separated Values (CSV) Files
 * @see https://datatracker.ietf.org/doc/html/rfc4180
 */

/**
 * COMMA = %x2C; default field delimiter
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-2
 */
export const COMMA = ",";

/**
 * TAB = %x09; tab field delimiter (TSV)
 */
export const TAB = "\t";

/**
 * DQUOTE = %x22; double quote
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-2
 */
export const DQUOTE = "\"";

/**
 * CR = %x0D; carriage return
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-2
 */
export const CR = "\r";

/**
 * LF = %x0A; line feed
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-2
 */
export const LF = "\n";

/**
 * CRLF = CR LF; standard record separator in RFC 4180
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-2
 */
export const CRLF = "\r\n";

/**
 * The MIME media type for CSV text is `text/csv`.
 * @see https://datatracker.ietf.org/doc/html/rfc4180#section-3
 */
export const MIME_TYPE = "text/csv";

/**
 * The MIME media type for tab-separated values (TSV) is `text/tab-separated-values`.
 */
export const TSV_MIME_TYPE = "text/tab-separated-values";

/**
 * Standard file extension for CSV files.
 */
export const EXTENSION = ".csv";
