import "server-only";

/** Stream bounds apply even when Content-Length is missing or dishonest. */
export async function readSource(body: ReadableStream<Uint8Array>, limit: number, signal: AbortSignal, exact = true) {
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("ocr_too_large");
      chunks.push(value);
    }
    if (exact && size !== limit) throw new Error("ocr_source_changed");
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
