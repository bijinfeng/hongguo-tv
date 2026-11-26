/** An oversized row may fill the viewport; requiring its entire height would prevent return focus. */
export function collectionTargetVisible(
  start: number,
  height: number,
  viewportStart: number,
  viewportHeight: number,
  inset: number,
) {
  const available = viewportHeight - inset * 2;
  if (height <= 0 || available <= 0) return false;
  const visible =
    Math.min(start + height, viewportStart + viewportHeight - inset) -
    Math.max(start, viewportStart + inset);
  return visible >= Math.min(height, available) - 0.5;
}
