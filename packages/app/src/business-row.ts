/**
 * Geometry shared by the business rows: a cover beside a title, one meta line and the row's own
 * actions. History, Following, Reservations and Notifications each used to spell this out, so the
 * same cover was re-derived in four files and drifted whenever one of them changed.
 *
 * Only the boxes are shared. What sits inside a row — which fields are real, which actions exist,
 * how focus is restored — stays with the page that owns the data.
 */
export type RowDensity = 'row' | 'compact';

/**
 * `row` is the片库 list shape at viewing distance; `compact` is the denser notification row, which
 * carries less text and so reads better with a smaller cover.
 */
export function rowCoverSize(density: RowDensity = 'row', tv: boolean) {
  if (density === 'compact') return tv ? { width: 36, height: 48 } : { width: 64, height: 80 };
  return tv ? { width: 54, height: 76 } : { width: 88, height: 112 };
}

/** Inner spacing of a business row, from the same two densities. */
export const rowGap = (density: RowDensity = 'row', tv: boolean) => {
  if (density === 'compact') return tv ? 8 : 12;
  return tv ? 10 : 20;
};

/** The text column's own gap: title, meta and any badge stay tighter than the row's outer gap. */
export const rowTextGap = (tv: boolean) => (tv ? 6 : 12);
