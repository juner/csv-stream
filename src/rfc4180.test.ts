import { COMMA, CR, CRLF, DQUOTE, EXTENSION, LF, MIME_TYPE, TAB, TSV_MIME_TYPE } from "./rfc4180.js";
import { describe, test } from "vitest";

describe("rfc4180 constants", () => {
  test("exports standard RFC 4180 constants", ({ expect }) => {
    expect(COMMA).toBe(",");
    expect(TAB).toBe("\t");
    expect(DQUOTE).toBe("\"");
    expect(CR).toBe("\r");
    expect(LF).toBe("\n");
    expect(CRLF).toBe("\r\n");
    expect(MIME_TYPE).toBe("text/csv");
    expect(TSV_MIME_TYPE).toBe("text/tab-separated-values");
    expect(EXTENSION).toBe(".csv");
  });
});
