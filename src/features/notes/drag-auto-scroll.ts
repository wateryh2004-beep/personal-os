const edgeSize = 52;
const minStep = 4;
const maxStep = 20;

/**
 * Returns the per-frame scroll distance for a pointer near a scroll area's
 * vertical edges. Keeping this pure makes the drag feedback consistent in
 * both desktop and mobile-sized navigators.
 */
export function notesDragAutoScrollDelta(pointerY: number, top: number, bottom: number) {
  if (bottom <= top) return 0;
  if (pointerY < top + edgeSize) {
    const pressure = Math.min(1, Math.max(0, (top + edgeSize - pointerY) / edgeSize));
    return -Math.ceil(minStep + (maxStep - minStep) * pressure);
  }
  if (pointerY > bottom - edgeSize) {
    const pressure = Math.min(1, Math.max(0, (pointerY - (bottom - edgeSize)) / edgeSize));
    return Math.ceil(minStep + (maxStep - minStep) * pressure);
  }
  return 0;
}
