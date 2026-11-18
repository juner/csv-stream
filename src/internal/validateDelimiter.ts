import { COMMA, CR, DQUOTE, LF } from "../rfc4180.js";

/**
 * Validates that the CSV field delimiter is a single character other than a quote or line break.
 */
export function validateDelimiter(delimiter: string): void {
  if (delimiter.length !== 1 || delimiter === DQUOTE || delimiter === CR || delimiter === LF) {
    throw new RangeError("delimiter must be one character other than a quote or line break");
  }
}

export { COMMA };
