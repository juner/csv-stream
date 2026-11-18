# Changelog

## 1.0.1

- Add generic column key type parameter `<K extends string = string>` to `CsvRecord`, `CsvInputRecord`, `CsvRowToRecordStream`, `InputCsvRecordStream`, `parseCsvRecords`, `parseCsvRecordResponse`, `CsvRecordToRowStream`, `OutputCsvRecordStream`, and `stringifyCsvRecords` so record keys are strongly typed and inferred from `headers`.
- Add specification links (`See also`) to `README.md` and `publishConfig` to `package.json`.

## 1.0.0

- Initial release.
- Add `CsvParseStream` and `parseCsv` for streaming CSV/TSV row parsing with RFC 4180 quoting, custom delimiters, `skipHeader`, `skipEmptyLines`, `maxLength`, `errorFallback`, and `TextDecoder` encoding options (`label`, `fatal`, `ignoreBOM`).
- Add `CsvRowToRecordStream`, `InputCsvRecordStream`, and `parseCsvRecords` for header-aware key-value record parsing.
- Add `CsvStringifyStream`, `stringifyCsv`, `CsvRecordToRowStream`, `OutputCsvRecordStream`, and `stringifyCsvRecords` for streaming CSV serialization with optional UTF-8 BOM (`bom: true`).
- Add `parseCsvResponse`, `parseCsvRecordResponse`, `detectCsvStreamFormat`, `detectCsvCharset`, and `detectCsvHeader` for `fetch()` `Response` streams.
- Add `@juners/csv-stream/rfc4180` subpath export for format constants.
