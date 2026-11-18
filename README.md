# @juners/csv-stream

CSV parsing and stringifying with standard Web Streams.

## Features

- Incrementally parses UTF-8 byte chunks or string chunks with `CsvParseStream`
- Handles quoted fields, doubled quotes, embedded line breaks, CRLF, and UTF-8 BOM
- Serializes rows to UTF-8 `Uint8Array` chunks with `CsvStringifyStream`
- Composes with `pipeThrough()`, `Response`, and other Web Streams APIs
- Configurable field delimiter, record separator, and queuing strategies

## Parsing

`CsvParseStream` emits each record as an array of strings:

```ts
import { CsvParseStream } from "@juners/csv-stream";

const response = await fetch("/data.csv");
const rows = response.body!.pipeThrough(new CsvParseStream());

for await (const row of rows) {
  console.log(row);
}
```

By default, the field separator is a comma. A custom one-character delimiter can be specified:

```ts
const rows = source.pipeThrough(new CsvParseStream({ delimiter: ";" }));
```

## Stringifying

`CsvStringifyStream` accepts arrays of primitive cell values and emits UTF-8 CSV bytes. `null` and
`undefined` become empty fields, and records end with CRLF by default.

```ts
import { CsvStringifyStream } from "@juners/csv-stream";

const csv = new CsvStringifyStream();
const writer = csv.writable.getWriter();

await writer.write(["name", "note"]);
await writer.write(["Ada", `said "hello"`]);
await writer.close();

const response = new Response(csv.readable, {
  headers: { "content-type": "text/csv; charset=utf-8" },
});
```

Fields containing a delimiter, quote, CR, or LF are quoted, and internal quotes are doubled.
Configure `recordSeparator` as `"\n"` to use LF instead of the default `"\r\n"`.

## Error handling

Malformed input, including quotes inside unquoted fields, unexpected characters after a closing
quote, and unterminated quoted fields, errors the parse stream with a `SyntaxError`.

## API

- `CsvParseStreamOptions`: `delimiter`, `writableStrategy`, and `readableStrategy`
- `CsvStringifyStreamOptions`: `delimiter`, `recordSeparator`, and queuing strategies
- `CsvCell`: supported cell value types (`string`, `number`, `boolean`, `bigint`, `null`, and `undefined`)
