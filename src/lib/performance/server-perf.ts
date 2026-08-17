/**
 * Opt-in server timing for private workspace reads.
 *
 * The payload deliberately contains only span names and elapsed time. It must
 * never include private records, request URLs, tokens, or user identifiers.
 */
export async function withPerfSpan<T>(span: string, work: () => PromiseLike<T> | T): Promise<T> {
  if (process.env.PERF_DEBUG !== "true") return work();

  const startedAt = performance.now();
  try {
    return await work();
  } finally {
    console.info(JSON.stringify({
      type: "perf",
      span,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  }
}
