# @juners/csv-stream

CSV and TSV parsing and stringifying with standard Web Streams and `AsyncIterable` / `for await...of` helpers.

## Features

- [x] Incrementally parses UTF-8 byte chunks or string chunks into CSV rows (`CsvParseStream`, `parseCsv`)
- [x] Header-aware key-value record streams and helpers (`InputCsvRecordStream`, `OutputCsvRecordStream`, `parseCsvRecords`, `stringifyCsvRecords`)
- [x] Handles quoted fields, doubled quotes, embedded line breaks, CRLF/LF/CR, and UTF-8 BOM
- [x] Supports Shift_JIS, EUC-JP, UTF-16, and any [WHATWG Encoding Standard](https://encoding.spec.whatwg.org/) label (`label`, `fatal`, `ignoreBOM`)
- [x] Serializes rows or records to UTF-8 `Uint8Array` chunks (`CsvStringifyStream`, `stringifyCsv`), with optional UTF-8 BOM output (`bom: true`)
- [x] Composes with `pipeThrough()`, `Response`, and other Web Streams APIs
- [x] `Content-Type`, `charset`, and RFC 4180 `header` (`present` / `absent`) detection (`text/csv; charset=Shift_JIS; header=present`, `text/tab-separated-values`, etc.) for `fetch()` responses (`parseCsvResponse`, `parseCsvRecordResponse`)
- [x] Maximum length (`maxLength`) protection, empty line skipping (`skipEmptyLines`), and custom error recovery (`errorFallback`)
- [x] Format constants via subpath export (`@juners/csv-stream/rfc4180`)

---

## Parsing Rows

`CsvParseStream` emits each record as an array of strings (`string[]`):

```ts
import { CsvParseStream } from "@juners/csv-stream";

const response = await fetch("/data.csv");
const rows = response.body!.pipeThrough(new CsvParseStream());

for await (const row of rows) {
  console.log(row);
}
```

Or use the async generator helper `parseCsv`:

```ts
import { parseCsv } from "@juners/csv-stream";

for await (const row of parseCsv(["name,note\r\n", "\"Ada\",\"said \"\"hello\"\"\""])) {
  console.log(row);
}
```

## Parsing Records (with Headers)

`InputCsvRecordStream` and `parseCsvRecords` map rows into key-value objects using the first row (or explicit `headers`) as keys:

```ts
import { parseCsvRecords } from "@juners/csv-stream";

for await (const record of parseCsvRecords(["id,name\n1,Ada\n2,Grace"])) {
  console.log(record); // { id: "1", name: "Ada" }, { id: "2", name: "Grace" }
}
```

## Stringifying Rows & Records

`CsvStringifyStream` accepts arrays of primitive cell values and emits UTF-8 CSV bytes. `null` and `undefined` become empty fields, and records end with CRLF by default:

```ts
import { CsvStringifyStream } from "@juners/csv-stream";

const csv = new CsvStringifyStream();
const writer = csv.writable.getWriter();

void writer.write(["name", "note"]);
void writer.write(["Ada", "said \"hello\""]);
void writer.close();

const response = new Response(csv.readable, {
  headers: { "content-type": "text/csv; charset=utf-8" },
});
```

Or serialize objects directly with `OutputCsvRecordStream` / `stringifyCsvRecords`:

```ts
import { stringifyCsvRecords } from "@juners/csv-stream";

const chunks = stringifyCsvRecords([
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
]);
```

## Fetch Response with `Content-Type`, `charset`, and `header` Detection

`parseCsvResponse` and `parseCsvRecordResponse` inspect `Content-Type` (`text/csv` or `text/tab-separated-values`), `charset`, and the RFC 4180 `header` parameter (`present` or `absent`) automatically:

```ts
import { parseCsvRecordResponse, parseCsvResponse } from "@juners/csv-stream";

// Row array stream (if header=present is in Content-Type, the header row is skipped by default)
const response = await fetch("https://example.com/data.tsv");
for await (const row of parseCsvResponse(response)) {
  console.log(row);
}

// Record object stream (respects header=present / header=absent and charset)
const recordResponse = await fetch("https://example.com/users.csv");
for await (const record of parseCsvRecordResponse(recordResponse)) {
  console.log(record);
}
```

## Error Handling & Safety

By default, malformed input (quotes inside unquoted fields, unexpected characters after a closing quote, or unterminated quoted fields) errors the stream with a `SyntaxError`. Use `errorFallback` to skip or recover from malformed rows, and `maxLength` to guard against unbounded fields:

```ts
import { CsvParseStream } from "@juners/csv-stream";

const stream = new CsvParseStream({
  skipEmptyLines: true,
  maxLength: 65536,
  errorFallback: false, // silently skip malformed rows and continue at the next line
});
```

## Format Constants (`@juners/csv-stream/rfc4180`)

```ts
import { COMMA, CRLF, HEADER_ABSENT, HEADER_PRESENT, LF, MIME_TYPE, TAB, TSV_MIME_TYPE } from "@juners/csv-stream/rfc4180";
```
