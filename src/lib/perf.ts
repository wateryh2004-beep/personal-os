"use client";

/** Lightweight, opt-in interaction diagnostics. Never logs in normal production use. */
export function perfMark(name: string, detail?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "true") return;
  const mark = `personal-os:${name}`;
  performance.mark(mark);
  console.info(`[perf] ${name}`, detail ?? {});
}

/** Measure an interaction from a previous mark without creating production analytics. */
export function perfMeasure(name: string, start: string, detail?: Record<string, unknown>) {
  if (process.env.NEXT_PUBLIC_PERF_DEBUG !== "true") return;
  const measure = `personal-os:${name}`;
  const startMark = `personal-os:${start}`;
  try {
    performance.measure(measure, startMark);
    const duration = performance.getEntriesByName(measure).at(-1)?.duration;
    console.info(`[perf] ${name}`, { duration: duration ? Math.round(duration) : undefined, ...detail });
  } catch {
    // A measurement is diagnostic only; a missing prior mark must never affect UX.
  }
}
