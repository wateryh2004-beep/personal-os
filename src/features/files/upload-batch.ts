/** Bound network and memory use while preserving successful files when one fails. */
export async function runUploadBatch<T>(items: T[], upload: (item: T, index: number) => Promise<void>, concurrency = 3) {
  let next = 0;
  const errors: { index: number; message: string }[] = [];
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try { await upload(items[index], index); }
      catch (error) { errors.push({ index, message: error instanceof Error ? error.message : "上传失败，请重试。" }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, worker));
  return { uploaded: items.length - errors.length, errors: errors.sort((a, b) => a.index - b.index) };
}
