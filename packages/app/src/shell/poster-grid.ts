import { windowSize } from 'nsh';
import type { ProductTarget } from '@hongguo/ui';
import { contentGutter } from './ContentColumn';

/**
 * One poster grid geometry for every desktop content page: the home catalog, the browse results
 * and the release calendar all place the same card in the same column, so moving between pages
 * never reflows the grid. TV keeps its own four-column shelf and derives widths from its lane.
 */
const MIN_CARD = 180;
const MAX_COLUMNS = 8;

/** Column gap, and the row's side inset that keeps a card's focus ring inside the scroller. */
export const POSTER_GAP = 20;
export const POSTER_ROW_INSET = 8;

const SIDEBAR = 176;
const CONTENT_MAX = 1660;

/** The column's inset, from the one place that owns it. */
export function contentInset() {
  const available = windowSize().width - SIDEBAR;
  return Math.max(contentGutter(), (available - CONTENT_MAX) / 2);
}

/** The content column's inner width after the sidebar and the shared inset. */
export function contentGridWidth() {
  return Math.max(0, windowSize().width - SIDEBAR - contentInset() * 2);
}

/** Cards grow to fill their column instead of wrapping early into a narrower grid. */
export function posterGrid(target: ProductTarget) {
  const usable = Math.max(0, contentGridWidth() - POSTER_ROW_INSET * 2);
  if (target === 'tv') {
    // TV draws one card per horizontal lane; the count here only sizes its slot.
    const lane = windowSize().width - 88;
    return {
      columns: 4,
      cardWidth: Math.max(150, Math.floor((lane - POSTER_GAP * 3) / 4)),
    };
  }
  const columns = Math.max(
    2,
    Math.min(MAX_COLUMNS, Math.floor((usable + POSTER_GAP) / (MIN_CARD + POSTER_GAP))),
  );
  return {
    columns,
    cardWidth: Math.max(150, Math.floor((usable - (columns - 1) * POSTER_GAP) / columns)),
  };
}
