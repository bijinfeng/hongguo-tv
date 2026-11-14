import { List, View, signal, effect, cleanup, type ListRef, type ViewRef } from 'nsh';
import { CardControls, PosterCard, tvUnit, type ProductTarget } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';

/** Shared stable-slot grid / TV shelf, with identity-based return anchors. */
export function PosterCollection(props: {
  target: ProductTarget;
  active: boolean;
  items: Drama[];
  collection: string;
  label: string;
  testID?: string;
  selected: string;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  caption: (drama: Drama) => string | undefined;
  onOpen: (drama: Drama, restore: () => void) => void;
}) {
  const width = signal(0);
  const height = signal(0);
  const columns = () => (props.target === 'tv' ? 1 : 4);
  const refs = new Map<string, ViewRef>();
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  let previous = props.collection;
  let disposed = false;
  const restore = () => {
    if (!anchor || disposed || !props.active) return;
    const index = props.items.findIndex((item) => item.series_id === anchor!.id);
    if (index >= 0)
      list?.scrollToIndex({
        index: Math.floor(index / columns()),
        viewOffset: -anchor.offset,
        animated: false,
      });
  };
  effect(() => {
    const collection = props.collection;
    if (collection !== previous) {
      previous = collection;
      anchor = undefined;
      list?.scrollToOffset({ offset: 0, animated: false });
    }
  });
  effect(() => {
    if (!props.active) return;
    void columns();
    frame = requestAnimationFrame(restore);
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
  });
  return (
    <List
      ref={(ref) => {
        list = ref;
      }}
      testID={props.testID}
      onScroll={() => {
        if (!props.active) return;
        const collection = props.collection;
        void list?.measureScrollPosition().then((position) => {
          if (!disposed && props.active && collection === props.collection && position) {
            const item = props.items[position.index * columns()];
            if (item) anchor = { id: item.series_id, offset: position.offset };
          }
        });
      }}
      onLayout={({ bounds }) => {
        if (bounds.size.width > 0) width.set(bounds.size.width);
        if (bounds.size.height > 0) height.set(bounds.size.height);
      }}
      each={Array.from({ length: Math.ceil(props.items.length / columns()) }, (_, i) => ({
        id: props.items[i * columns()].series_id,
        items: props.items.slice(i * columns(), (i + 1) * columns()),
      }))}
      keyExtractor={(row) => row.id}
      horizontal={props.target === 'tv'}
      estimatedItemSize={props.target === 'tv' ? tvUnit(260) : ((width() - 84) / 4) * 1.35 + 84}
      class="flex-1"
      style={props.target === 'desktop' ? { width: '100%', maxWidth: 1100 } : undefined}
      contentStyle={{ gap: props.target === 'tv' ? tvUnit(28) : 28 }}
    >
      {(row) => (
        <View style={props.target === 'tv' ? { width: tvUnit(260) } : undefined}>
          <CardControls onNavigate={props.onNavigate} label={props.label} class="w-full gap-7">
            <Each of={Array.from({ length: columns() }, (_, i) => i)}>
              {(slot) => (
                <View class="flex-1">
                  <If when={row().items[slot()]}>
                    {(drama) => {
                      let ref: ViewRef | undefined;
                      effect(() => {
                        const id = drama().series_id;
                        if (ref) refs.set(id, ref);
                        cleanup(() => {
                          if (refs.get(id) === ref) refs.delete(id);
                        });
                      });
                      return (
                        <PosterCard
                          buttonRef={(node) => {
                            ref = node;
                            refs.set(drama().series_id, node);
                          }}
                          testID={`drama-${drama().series_id}`}
                          availableHeight={height()}
                          width={(width() - 84) / 4 - 4}
                          title={drama().title}
                          cover={drama().cover_fallback || drama().cover}
                          caption={props.caption(drama())}
                          selected={props.selected === drama().series_id}
                          onPress={() => {
                            const id = drama().series_id;
                            const collection = props.collection;
                            props.onOpen(drama(), () => {
                              if (disposed || !props.active || props.collection !== collection)
                                return;
                              restore();
                              const ownsFocus = props.focusGuard();
                              frame = requestAnimationFrame(() => {
                                if (
                                  !disposed &&
                                  ownsFocus() &&
                                  props.active &&
                                  props.collection === collection
                                )
                                  refs.get(id)?.focus();
                              });
                            });
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
