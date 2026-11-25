import {
  List,
  View,
  cleanup,
  effect,
  signal,
  type JSX,
  type ListRef,
  type ScrollRef,
  type ViewRef,
} from 'nsh';
import { CardControls, PosterCard, type ProductTarget } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import { POSTER_GAP, posterGrid } from '../shell/poster-grid';
import { PageScroll } from '../shell/PageScroll';

/**
 * A poster page: one page scroll, as NSH documents for "one page scroll containing page chrome and
 * one or more long lists" — the list uses `viewport="parent"`. The heading, filters and paging
 * action travel with the cards, so the reader scrolls content rather than a short window cut out
 * below the chrome, and the list still recycles rows near the page's viewport.
 *
 * The page owns every scroll setting. The grid only reports and restores through the list's own
 * `measureScrollPosition` / `scrollToIndex`, which still resolve against the list's content in a
 * parent viewport. Both run once, when a gesture settles: measuring on every frame would pay a
 * layout round trip per frame of a drag.
 *
 * TV keeps a bounded lane. A remote moves focus between lanes rather than dragging a page, so its
 * chrome sits above a shelf that scrolls on its own.
 */
export function PosterPage(props: {
  target: ProductTarget;
  active: boolean;
  items: Drama[];
  collection: string;
  label: string;
  /** The grid's test id; the page's own is `pageTestID` when a page needs both. */
  testID?: string;
  pageTestID?: string;
  selected: string;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  caption: (drama: Drama) => string | undefined;
  onOpen: (drama: Drama, restore: () => void) => void;
  onSource?: (restore: () => void) => void;
  /** Page chrome: heading, filters, pending and failure states. */
  header?: () => JSX.Element;
  /** Content after the grid: paging, and the entries only TV carries on a page. */
  footer?: () => JSX.Element;
  /** Desktop content frame, matching the shared content column. */
  frame?: { top?: number; bottom?: number; gap?: number };
  /** TV frame for the chrome above the shelf. */
  tvFrame?: { top?: number; bottom?: number; gap?: number };
}) {
  const tv = () => props.target === 'tv';
  const columns = () => (tv() ? 1 : posterGrid(props.target).columns);
  const laneWidth = signal(0);
  const laneHeight = signal(0);
  const refs = new Map<string, ViewRef>();
  let list: ListRef | undefined;
  let page: ScrollRef | undefined;
  let anchor: { index: number; offset: number } | undefined;
  let frame = 0;
  let previous = props.collection;
  let disposed = false;
  const restore = () => {
    const target = anchor;
    if (!target || disposed || !props.active) return;
    list?.scrollToIndex({ index: target.index, viewOffset: -target.offset, animated: false });
  };
  effect(() => {
    const collection = props.collection;
    if (collection === previous) return;
    previous = collection;
    anchor = undefined;
    // The page scrolls a parent-viewport grid, so the page is what returns to the top.
    if (tv()) list?.scrollToOffset({ offset: 0, animated: false });
    else page?.scrollTo({ y: 0, animated: false });
  });
  // Only activation and a column reflow move the grid back. Restoring on every render would fight
  // the reader's own scroll, and a restore's own scroll is not a new reading position.
  let wasActive = false;
  let previousColumns = columns();
  effect(() => {
    const active = props.active;
    const nextColumns = columns();
    const entered = active && !wasActive;
    const reflowed = active && nextColumns !== previousColumns;
    wasActive = active;
    previousColumns = nextColumns;
    if (!entered && !reflowed) return;
    frame = requestAnimationFrame(restore);
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
  });

  /** Where the reader is: the list's first visible row and how far into it. */
  const capture = () => {
    if (!props.active) return;
    const collection = props.collection;
    void list?.measureScrollPosition().then((position) => {
      if (!disposed && props.active && collection === props.collection && position)
        anchor = position;
    });
  };

  const source = (drama: Drama) => {
    const id = drama.series_id;
    const collection = props.collection;
    return () => {
      if (disposed || !props.active || props.collection !== collection) return;
      restore();
      const ownsFocus = props.focusGuard();
      frame = requestAnimationFrame(() => {
        if (!disposed && ownsFocus() && props.active && props.collection === collection)
          refs.get(id)?.focus();
      });
    };
  };

  const rows = () =>
    Array.from({ length: Math.ceil(props.items.length / columns()) }, (_, index) => ({
      id: props.items[index * columns()].series_id,
      items: props.items.slice(index * columns(), (index + 1) * columns()),
    }));

  const listBody = (width: number, availableHeight?: number) => (
    <List
      ref={(ref) => {
        list = ref;
      }}
      // The page's Scroll owns `testID`; the grid's own measurement does not need it, and two
      // views may not share one, or a step that names it cannot tell which it reached.
      testID={props.testID ? `${props.testID}-grid` : undefined}
      // The page scrolls this list with everything above it, and it still recycles rows near the
      // page's viewport.
      viewport={tv() ? 'own' : 'parent'}
      onScroll={tv() ? capture : undefined}
      onLayout={({ bounds }) => {
        if (bounds.size.width > 0) laneWidth.set(bounds.size.width);
        if (bounds.size.height > 0) laneHeight.set(bounds.size.height);
      }}
      each={rows()}
      keyExtractor={(entry) => entry.id}
      horizontal={tv()}
      estimatedItemSize={tv() ? 138 : posterGrid(props.target).cardWidth * 1.35 + 84}
      class={tv() ? 'flex-1' : 'w-full'}
      contentStyle={{ gap: tv() ? 6 : 12 }}
    >
      {(entry) => (
        <View style={tv() ? { width: 138, paddingHorizontal: 4 } : { paddingVertical: 8 }}>
          <CardControls
            onNavigate={props.onNavigate}
            label={props.label}
            class="w-full"
            gap={tv() ? undefined : POSTER_GAP}
          >
            <Each of={Array.from({ length: columns() }, (_, index) => index)}>
              {(slot) => (
                <View class="flex-1">
                  <If when={entry().items[slot()]}>
                    {(drama) => {
                      let node: ViewRef | undefined;
                      effect(() => {
                        const id = drama().series_id;
                        if (node) refs.set(id, node);
                        cleanup(() => {
                          if (refs.get(id) === node) refs.delete(id);
                        });
                      });
                      return (
                        <PosterCard
                          buttonRef={(ref) => {
                            node = ref;
                            refs.set(drama().series_id, ref);
                          }}
                          testID={`drama-${drama().series_id}`}
                          // A page scroll never caps a cover: the card keeps its 2:2.7 ratio at
                          // any window height, and the reader scrolls to see the rest of it. Only
                          // a bounded TV lane caps one.
                          availableHeight={availableHeight}
                          width={width}
                          title={drama().title}
                          cover={drama().cover_fallback || drama().cover}
                          caption={props.caption(drama())}
                          selected={props.selected === drama().series_id}
                          onFocus={() => props.onSource?.(source(drama()))}
                          onPress={() => {
                            const restoreSource = source(drama());
                            props.onSource?.(restoreSource);
                            props.onOpen(drama(), restoreSource);
                          }}
                        />
                      );
                    }}
                  </If>
                </View>
              )}
            </Each>
          </CardControls>
        </View>
      )}
    </List>
  );

  if (!tv())
    return (
      <PageScroll
        target={props.target}
        testID={props.pageTestID ?? props.testID}
        top={props.frame?.top}
        bottom={props.frame?.bottom}
        gap={props.frame?.gap}
        // The page reports the reader's position once a gesture settles: one layout read per
        // drag, not one per frame.
        onScrollSettled={capture}
        scrollRef={(ref) => {
          page = ref;
        }}
      >
        {props.header?.()}
        {listBody(posterGrid(props.target).cardWidth)}
        {props.footer?.()}
      </PageScroll>
    );

  return (
    <View
      testID={props.pageTestID ?? props.testID}
      class="flex-1"
      style={{
        paddingTop: props.tvFrame?.top ?? 16,
        paddingBottom: props.tvFrame?.bottom ?? 0,
        gap: props.tvFrame?.gap ?? 14,
      }}
    >
      {props.header?.()}
      <View
        class="flex-1"
        onLayout={({ bounds }) => {
          if (bounds.size.height > 0) laneHeight.set(bounds.size.height);
        }}
      >
        {listBody((laneWidth() - 84) / 4 - 4, Math.max(0, laneHeight() - 8))}
      </View>
      {props.footer?.()}
    </View>
  );
}
