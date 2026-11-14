import { context, windowSize } from 'nsh';

/** Product input/density family, independent of the host operating system. */
export type ProductTarget = 'desktop' | 'tv';
/** Inject once at the app surface; controls read this in reactive bindings. */
export const Product = context<ProductTarget>('desktop');
/** Approved control heights in desktop points and TV reference units. */
export const uiScale = { desktop: { control: 44 }, tv: { control: 60 } } as const;
/** Convert the approved 1920-wide TV design into the current logical viewport. */
export const tvUnit = (value: number) => (value * windowSize().width) / 1920;
/** The finite sizes shared by ordinary controls; TV keeps one comfortable target. */
export type ControlSize = 'md' | 'sm';
/** One size selects geometry, type and icon together; values are logical units. */
export function controlMetrics(size: ControlSize = 'md') {
  const tv = Product() === 'tv';
  const scale = (value: number) => (tv ? tvUnit(value) : value);
  return {
    height: scale(tv ? 60 : size === 'sm' ? 36 : 44),
    fontSize: scale(tv ? 22 : size === 'sm' ? 14 : 16),
    paddingHorizontal: scale(tv ? 24 : size === 'sm' ? 12 : 16),
    paddingVertical: scale(tv ? 12 : 8),
    gap: scale(tv ? 12 : 8),
    radius: scale(12),
    iconSize: scale(tv ? 26 : size === 'sm' ? 18 : 20),
  };
}
