/** Bounded workers; output order never depends on network completion order.
 * Drain in-flight workers before rejecting; no detached writes after failure. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16)
    throw new Error("Concurrency must be an integer from 1 to 16");
  const result: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed) {
        const index = next++;
        if (index >= items.length) return;
        try {
          result[index] = await work(items[index]!, index);
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
    }),
  );
  if (failed) throw failure;
  return result;
}
