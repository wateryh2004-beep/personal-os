"use client";

/** Lightweight, opt-in interaction diagnostics. Never logs in normal production use. */
export function perfMark(name: string, detail?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "true") return;
  const mark = `personal-os:${name}`;
  performance.mark(mark);
  console.info(`[perf] ${name}`, detail ?? {});
}
