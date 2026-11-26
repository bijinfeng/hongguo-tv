import { fontScale, safeArea, windowSize } from 'nsh';
import { tvGridColumns, type TvCollectionKind } from './tv-layout-metrics';

/** Width is the laid-out region, never the television panel's pixel resolution. */
export function tvColumns(kind: TvCollectionKind, width = windowSize().width - 84) {
  return tvGridColumns(kind, width, fontScale());
}

/** Insets are applied once at the TV root; a focused outline has its own clearance. */
export function tvInsets(overscan = false) {
  const system = safeArea();
  const x = overscan ? 48 : 36;
  const y = overscan ? 27 : 24;
  return {
    top: Math.max(system.top, y) + 6,
    right: Math.max(system.right, x) + 6,
    bottom: Math.max(system.bottom, y) + 6,
    left: Math.max(system.left, x) + 6,
  };
}
