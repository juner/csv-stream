import { describe, test } from "vitest";
import { validateDelimiter } from "./validateDelimiter.js";

describe("validateDelimiter", () => {
  test("accepts valid single-character delimiters", ({ expect }) => {
    expect(() => validateDelimiter(",")).not.toThrow();
    expect(() => validateDelimiter(";")).not.toThrow();
    expect(() => validateDelimiter("\t")).not.toThrow();
  });

  test("rejects invalid delimiters", ({ expect }) => {
    expect(() => validateDelimiter("")).toThrow(RangeError);
    expect(() => validateDelimiter("::")).toThrow(RangeError);
    expect(() => validateDelimiter("\"")).toThrow(RangeError);
    expect(() => validateDelimiter("\r")).toThrow(RangeError);
    expect(() => validateDelimiter("\n")).toThrow(RangeError);
  });
});
