/**
 * Pipes an `AsyncIterable` or `Iterable` through a `ReadableWritablePair` and yields each output chunk,
 * properly propagating source errors and cleaning up the writer when the consumer stops early (e.g. via `break`).
 */
export async function* pipeIterable<I, O>(
  source: AsyncIterable<I> | Iterable<I>,
  stream: ReadableWritablePair<O, I>,
): AsyncGenerator<O, void, undefined> {
  const writer = stream.writable.getWriter();
  const writePromise = (async () => {
    try {
      for await (const chunk of source) {
        await writer.write(chunk);
      }
      await writer.close();
    }
    catch (error) {
      await writer.abort(error);
    }
  })();
  try {
    yield* stream.readable;
  }
  finally {
    await writePromise;
  }
}
