import { createHash } from "node:crypto";

/** Hash sequentially; never allocate a whole file, reject truncation/overflow. */
export async function verifyFileStream(body: ReadableStream<Uint8Array>, expectedSize: number, expectedChecksum?: string | null, maxSize = 100 * 1024 * 1024, signal?: AbortSignal) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > maxSize) {
    await body.cancel().catch(() => {});
    throw new Error("invalid_file_size");
  }
  const reader = body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const hash = createHash("sha256");
  let size = 0;
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > expectedSize) throw new Error("file_size_mismatch");
      hash.update(value);
    }
    if (size !== expectedSize) throw new Error("file_size_mismatch");
    const checksum = hash.digest("hex");
    if (expectedChecksum && checksum !== expectedChecksum) throw new Error("file_checksum_mismatch");
    return { size, checksum };
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
