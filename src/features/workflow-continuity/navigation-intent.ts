"use client";

// Deliberately independent of router, cache and business modules: foreground
// handlers can supersede a pending capture before Next commits its destination.
let epoch = 0;
export function announceNavigationIntent() { epoch += 1; }
export function beginNavigationIntent() {
  const captured = ++epoch;
  return () => captured === epoch;
}

/** Observe an already established intent without reviving a superseded one. */
export function captureNavigationIntent() { const captured = epoch; return () => captured === epoch; }
