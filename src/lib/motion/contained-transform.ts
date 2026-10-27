/** Finite border-box geometry only; no text, DOM snapshots, or user state. */
export type MotionBounds = { left: number; top: number; width: number; height: number };
const finite = (value: number) => Number.isFinite(value);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
function valid(rect: MotionBounds) { return [rect.left, rect.top, rect.width, rect.height].every(finite) && rect.width > 0 && rect.height > 0; }
/** Clamp a translated/scaled endpoint around the actual CSS transform origin.
 * Every intermediate point uses the same monotonic interpolation, so each edge
 * is an affine combination of contained endpoints (opening and reverse alike).
 */
export function containedTransform(rest: MotionBounds, viewport: MotionBounds, desired: { x: number; y: number; scaleX: number; scaleY: number; originX?: number; originY?: number }) {
  if (!valid(rest) || !valid(viewport) || ![desired.x, desired.y, desired.scaleX, desired.scaleY, desired.originX ?? .5, desired.originY ?? .5].every(finite) || desired.scaleX <= 0 || desired.scaleY <= 0) return null;
  if (rest.left < viewport.left || rest.top < viewport.top || rest.left + rest.width > viewport.left + viewport.width || rest.top + rest.height > viewport.top + viewport.height) return null;
  const originX = clamp(desired.originX ?? .5, 0, 1), originY = clamp(desired.originY ?? .5, 0, 1);
  if (![originX, originY].every(finite)) return null;
  const scaleX = Math.min(desired.scaleX, 1, viewport.width / rest.width);
  const scaleY = Math.min(desired.scaleY, 1, viewport.height / rest.height);
  const insetX = rest.width * (1 - scaleX), insetY = rest.height * (1 - scaleY);
  const x = clamp(desired.x, viewport.left - rest.left - insetX * originX, viewport.left + viewport.width - rest.left - rest.width + insetX * (1 - originX));
  const y = clamp(desired.y, viewport.top - rest.top - insetY * originY, viewport.top + viewport.height - rest.top - rest.height + insetY * (1 - originY));
  return { x, y, scaleX, scaleY };
}
/** Workbench panes retain their document height; only their horizontal FLIP
 * footprint is fitted into the current layout after a swap or width change. */
export function containedPaneStart(from: MotionBounds, target: MotionBounds, container: MotionBounds) {
  if (!valid(from) || !valid(target) || !valid(container)) return null;
  const width = Math.min(from.width, container.width);
  const left = clamp(from.left, container.left, container.left + container.width - width);
  return { x: left - target.left, scaleX: width / target.width };
}
