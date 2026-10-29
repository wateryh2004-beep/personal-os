/** Bounded upload concurrency; results stay in the caller's original order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T, index: number) => Promise<R>, onSettled?: (result: R, index: number) => void): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("invalid_concurrency");
  const results = new Array<R>(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
      onSettled?.(results[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}
