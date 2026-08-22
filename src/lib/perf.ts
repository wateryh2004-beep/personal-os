"use client";

const perfDebug = process.env.NEXT_PUBLIC_PERF_DEBUG === "true";

/**
 * Keep native browser marks available in production so a Performance recording
 * can diagnose a real navigation without rebuilding the app. Console output
 * remains opt-in to avoid normal-use noise.
 */
export function perfMark(name: string, detail?: Record<string, unknown>) {
  const mark = `personal-os:${name}`;
  performance.mark(mark);
  if (perfDebug) {
    console.info(JSON.stringify({ type: "perf", event: name, at: Math.round(performance.now()), ...(detail ?? {}) }));
  }
}

/** Measure an interaction from a previous mark without creating production analytics. */
export function perfMeasure(name: string, start: string, detail?: Record<string, unknown>) {
  const measure = `personal-os:${name}`;
  const startMark = `personal-os:${start}`;
  try {
    performance.measure(measure, startMark);
    if (perfDebug) {
      const duration = performance.getEntriesByName(measure).at(-1)?.duration;
      console.info(JSON.stringify({ type: "perf", event: name, durationMs: duration ? Math.round(duration) : undefined, ...(detail ?? {}) }));
    }
  } catch {
    // A measurement is diagnostic only; a missing prior mark must never affect UX.
  }
}
