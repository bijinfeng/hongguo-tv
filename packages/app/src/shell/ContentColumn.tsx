import { View, windowSize, type JSX } from 'nsh';
import type { Store } from '../store';

/** Draft gutters: 3.5vw, kept between 24 and 64 on desktop. */
export function contentGutter() {
  return Math.min(64, Math.max(24, windowSize().width * 0.035));
}

/** Desktop draft content column: 1660 max width, centred by inset, with the shared gutter. */
export function desktopContentFrame(options?: { top?: number; bottom?: number; gap?: number }) {
  // Self-centring collapses virtualized lists on the native hosts, so the column centres by inset.
  const available = windowSize().width - 176;
  const inset = Math.max(contentGutter(), (available - 1660) / 2);
  return {
    width: '100%' as const,
    paddingHorizontal: inset,
    paddingTop: options?.top ?? 24,
    paddingBottom: options?.bottom ?? 40,
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
  const gap = () => (props.store.target === 'tv' ? 12 : 24);
  return (
    <View
      class="w-full"
      style={
        props.store.target === 'tv'
          ? { paddingBottom: props.bottom ?? 45, gap: gap() }
          : {
              ...desktopContentFrame({ top: props.top ?? 16, bottom: props.bottom ?? 48 }),
              gap: gap(),
            }
      }
    >
      {props.children}
    </View>
  );
}
