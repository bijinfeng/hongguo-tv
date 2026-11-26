import { View, windowSize, type JSX } from 'nsh';
import { space } from '@hongguo/ui';
import type { Store } from '../store';

/**
 * Desktop content gutter on the spacing scale: `xl` (32) in a narrow window,
 * `2xl` (40) from 1200 and `3xl` (48) from 1500. A viewport fraction never lands
 * on the scale, so every page sat a pixel or two off its own rhythm.
 */
export function contentGutter() {
  const width = windowSize().width;
  if (width >= 1500) return space('3xl');
  if (width >= 1200) return space('2xl');
  return space('xl');
}

/** Desktop content column: 1660 max width, centred by inset, with the shared gutter. */
export function desktopContentFrame(options?: { top?: number; bottom?: number; gap?: number }) {
  // Self-centring collapses virtualized lists on the native hosts, so the column centres by inset.
  const available = windowSize().width - 176;
  const inset = Math.max(contentGutter(), (available - 1660) / 2);
  return {
    width: '100%' as const,
    paddingHorizontal: inset,
    paddingTop: options?.top ?? space('lg'),
    paddingBottom: options?.bottom ?? space('2xl'),
    gap: options?.gap,
  };
}

/** The one content column shared by the browse pages; TV keeps the shell's own inset. */
export function ContentColumn(props: {
  store: Store;
  children?: JSX.Element;
  top?: number;
  bottom?: number;
}) {
  const gap = () => (props.store.target === 'tv' ? space('sm') : space('lg'));
  return (
    <View
      class="w-full"
      style={
        props.store.target === 'tv'
          ? { paddingBottom: props.bottom ?? 45, gap: gap() }
          : {
              ...desktopContentFrame({
                top: props.top ?? space('md'),
                bottom: props.bottom ?? space('3xl'),
              }),
              gap: gap(),
            }
      }
    >
      {props.children}
    </View>
  );
}
