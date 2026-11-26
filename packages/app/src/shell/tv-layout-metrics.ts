export type TvCollectionKind = 'collection' | 'search' | 'ranking' | 'episodes' | 'continue';
const tiers: Record<TvCollectionKind, readonly [number, number, number]> = {
  collection: [6, 5, 4],
  search: [4, 3, 2],
  ranking: [5, 4, 3],
  episodes: [10, 8, 6],
  continue: [3, 2, 2],
};
const minimum: Record<TvCollectionKind, number> = {
  collection: 128,
  search: 112,
  ranking: 120,
  episodes: 48,
  continue: 220,
};
/** Pure layout policy, also used by native-host boundary regression tests. */
export function tvGridColumns(kind: TvCollectionKind, width: number, textScale: number) {
  const tier = textScale < 1.25 ? 0 : textScale < 1.75 ? 1 : 2;
  const cap = tiers[kind][tier];
  const gap = kind === 'episodes' ? 8 : 16;
  const fit = Math.floor((Math.max(0, width) + gap) / (minimum[kind] + gap));
  return Math.max(1, Math.min(cap, fit));
}
