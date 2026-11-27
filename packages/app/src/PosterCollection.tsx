import { List, View, signal, effect, cleanup, fontScale, type ListRef, type ViewRef } from 'nsh';
import { CardControls, PosterCard, textLineHeight, space, type ProductTarget } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import { tvColumns } from './shell/tv-layout';
import { collectionTargetVisible } from './collection-visibility';

export interface PosterCollectionProps {
  target: ProductTarget;
  active: boolean;
  density?: 'collection' | 'search';
  layout?: 'grid' | 'shelf';
  items: Drama[];
  collection: string;
  label: string;
  testID?: string;
  itemTestIDPrefix?: string;
  selected: string;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  caption: (drama: Drama) => string | undefined;
  onOpen: (drama: Drama, restore: () => void) => void;
  onSource?: (restore: () => void) => void;
  onEmptyFocus?: () => void;
}

/** A different collection owns a fresh viewport; the same collection retains its return anchor. */
export function PosterCollection(props: PosterCollectionProps) {
  return (
    <Each of={[props.collection]} key={(identity) => identity}>
      {() => <Collection {...props} />}
    </Each>
  );
}

/** Shared stable-slot grid / TV shelf, with identity-based return anchors. */
function Collection(props: PosterCollectionProps) {
  const width = signal(0);
  const height = signal(0);
  const shelf = () => props.layout === 'shelf';
  const columns = () =>
    props.target === 'tv' ? tvColumns(props.density ?? 'collection', width() - 12) : 4;
  const cardWidth = () => {
    const gap = props.target === 'tv' ? 16 : 28;
    const padding = props.target === 'tv' ? 12 : 16;
    return Math.max(1, (width() - padding - gap * Math.max(0, columns() - 1)) / columns());
  };
  const rowSize = () => (shelf() ? 1 : columns());
  const axis = () => (shelf() ? 'x' : 'y');
  const dimension = () => (shelf() ? 'width' : 'height');
  const shelfHeight = () =>
    Math.min(132, cardWidth()) * 1.35 +
    (textLineHeight('content-title') * 2 + textLineHeight('meta') * 2) * fontScale() +
    space('sm') +
    space('xxs') +
    32;
  const refs = new Map<string, ViewRef>();
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  let focusFrame = 0;
  let scrollRevision = 0;
  let intent:
    | {
        id: string;
        collection: string;
        owns: () => boolean;
        restorePosition: boolean;
        checked: boolean;
      }
    | undefined;
  const validIntent = () =>
    intent && !disposed && props.active && intent.collection === props.collection && intent.owns();
  const focusSource = () => {
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => {
      const owned = intent;
      if (!owned || !validIntent()) {
        intent = undefined;
        return;
      }
      if (owned.restorePosition) {
        owned.restorePosition = false;
        restore();
        focusSource();
        return;
      }
      const index = props.items.findIndex((item) => item.series_id === owned.id);
      if (index < 0) {
        intent = undefined;
        return;
      }
      const reveal = () =>
        list?.scrollToIndex({
          index: Math.floor(index / rowSize()),
          viewPosition: 0.5,
          animated: false,
        });
      const ref = refs.get(owned.id);
      if (!ref) {
        reveal();
        return;
      }
      void Promise.all([ref.measure(), list?.measure(), list?.measureScrollPosition()]).then(
        ([card, viewport, position]) => {
          if (intent !== owned || !validIntent() || refs.get(owned.id) !== ref) return;
          if (
            !card ||
            !viewport ||
            !collectionTargetVisible(
              card.pagePosition[axis()],
              card.bounds.size[dimension()],
              viewport.pagePosition[axis()],
              viewport.bounds.size[dimension()],
              6,
            )
          ) {
            if (!owned.checked) {
              owned.checked = true;
              if (card && viewport && position) {
                // Center this card within the List, whose row may be taller than its siblings.
                const offset =
                  position.offset +
                  card.pagePosition[axis()] -
                  viewport.pagePosition[axis()] -
                  (viewport.bounds.size[dimension()] - card.bounds.size[dimension()]) / 2;
                list?.scrollToIndex({
                  index: position.index,
                  viewOffset: -offset,
                  animated: false,
                });
              } else reveal();
              focusSource();
            }
            return;
          }
          intent = undefined;
          ref.focus();
        },
      );
    });
  };
  let disposed = false;
  const restore = () => {
    if (!anchor || disposed || !props.active) return;
    const index = props.items.findIndex((item) => item.series_id === anchor!.id);
    if (index >= 0)
      list?.scrollToIndex({
        index: Math.floor(index / rowSize()),
        viewOffset: -anchor.offset,
        animated: false,
      });
  };
  effect(() => {
    if (!props.active) {
      intent = undefined;
      return;
    }
    void rowSize();
    void props.items.length;
    frame = requestAnimationFrame(restore);
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(focusFrame);
  });
  return (
    <List
      ref={(ref) => {
        list = ref;
      }}
      testID={props.testID}
      horizontal={shelf()}
      onScroll={() => {
        if (!props.active) return;
        const collection = props.collection;
        const revision = ++scrollRevision;
        const count = rowSize();
        void list?.measureScrollPosition().then((position) => {
          if (
            !disposed &&
            props.active &&
            collection === props.collection &&
            revision === scrollRevision &&
            count === rowSize() &&
            position
          ) {
            const item = props.items[position.index * count];
            if (item) anchor = { id: item.series_id, offset: position.offset };
          }
        });
      }}
      onLayout={({ bounds }) => {
        if (bounds.size.width > 0) width.set(bounds.size.width);
        if (bounds.size.height > 0) height.set(bounds.size.height);
        if (intent) focusSource();
      }}
      each={Array.from({ length: Math.ceil(props.items.length / rowSize()) }, (_, i) => ({
        id: props.items[i * rowSize()].series_id,
        items: props.items.slice(i * rowSize(), (i + 1) * rowSize()),
      }))}
      keyExtractor={(row) => row.id}
      estimatedItemSize={shelf() ? cardWidth() + 16 : cardWidth() * 1.35 + 52}
      class={shelf() ? 'shrink-0' : 'flex-1'}
      style={{
        ...(props.target === 'desktop'
          ? { width: '100%', maxWidth: 1100 }
          : { marginHorizontal: -6 }),
        ...(shelf() ? { height: shelfHeight() } : {}),
      }}
      contentStyle={{
        gap: shelf() ? 16 : 12,
        paddingHorizontal: props.target === 'tv' ? 6 : 8,
        paddingVertical: props.target === 'tv' ? 4 : 0,
      }}
    >
      {(row) => (
        <View
          style={
            shelf()
              ? { width: cardWidth(), paddingVertical: space('xs') }
              : props.target === 'tv'
                ? { width: '100%', paddingVertical: space('xs') }
                : { paddingVertical: space('xs') }
          }
        >
          <CardControls
            onNavigate={props.onNavigate}
            label={props.label}
            class="w-full"
            gap={props.target === 'tv' ? 16 : 28}
          >
            <Each of={Array.from({ length: rowSize() }, (_, i) => i)}>
              {(slot) => (
                <View class="flex-1">
                  <If when={row().items[slot()]}>
                    {(drama) => {
                      let ref: ViewRef | undefined;
                      effect(() => {
                        const id = drama().series_id;
                        if (ref) refs.set(id, ref);
                        if (intent?.id === id) focusSource();
                        cleanup(() => {
                          if (refs.get(id) === ref) refs.delete(id);
                        });
                      });
                      const source = () => {
                        const id = drama().series_id;
                        const position = props.items.findIndex((item) => item.series_id === id);
                        const collection = props.collection;
                        return () => {
                          if (disposed || !props.active || props.collection !== collection) return;
                          const target =
                            props.items.find((item) => item.series_id === id) ??
                            props.items[Math.min(position, props.items.length - 1)];
                          if (!target) {
                            props.onEmptyFocus?.();
                            return;
                          }
                          intent = {
                            id: target.series_id,
                            collection,
                            owns: props.focusGuard(),
                            restorePosition: true,
                            checked: false,
                          };
                          focusSource();
                        };
                      };
                      return (
                        <PosterCard
                          density={props.target === 'tv' ? 'compact' : undefined}
                          buttonRef={(node) => {
                            ref = node;
                            refs.set(drama().series_id, node);
                            if (intent?.id === drama().series_id) focusSource();
                          }}
                          testID={`${props.itemTestIDPrefix ?? 'drama'}-${drama().series_id}`}
                          availableHeight={Math.max(
                            0,
                            height() - (props.target === 'tv' ? 16 : 32),
                          )}
                          width={props.target === 'tv' ? Math.min(132, cardWidth()) : cardWidth()}
                          fit={props.target === 'tv' ? 'contain' : undefined}
                          title={drama().title}
                          cover={drama().cover_fallback || drama().cover}
                          caption={props.caption(drama())}
                          selected={props.selected === drama().series_id}
                          onFocus={() => {
                            if (intent?.id === drama().series_id) intent = undefined;
                            props.onSource?.(source());
                          }}
                          onPress={() => {
                            const restore = source();
                            props.onSource?.(restore);
                            props.onOpen(drama(), restore);
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
}
