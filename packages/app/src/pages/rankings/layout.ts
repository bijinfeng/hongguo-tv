import { windowSize } from 'nsh';

/**
 * The ranking draft keeps one reading column (`max-width: 1120px`) for the hero, the selector
 * rows and the entries, so every band shares the same leading and trailing edge. The column is
 * inset rather than centred: a self-centred column collapses the virtualized list on the native
 * hosts.
 */
export const RANKING_COLUMN = 1120;

/** The desktop shell's sidebar lane, which is not part of the content width. */
const SIDEBAR = 176;

/**
 * The row focus-ring safe area: `outline-2` plus `outline-offset-4` needs 6 outside the control,
 * kept at 8 for rounding. Rows carry it as their own leading/trailing gutter, so a focused row's
 * outline stays inside the scroller without pushing the hairline inboard of the hero.
 */
export const RANKING_ROW_SAFE = 8;

/** One inset for every ranking band: heading, source tabs, hero, selector rows and entries. */
export function rankingBandInset(): number {
  const available = windowSize().width - SIDEBAR;
  return Math.max(0, (available - RANKING_COLUMN) / 2);
}
