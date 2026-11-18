import {
  List,
  View,
  cleanup,
  effect,
  lifecycle,
  signal,
  windowSize,
  type ListRef,
  type ViewRef,
} from 'nsh';
import { Button, CardControls, PosterCard, UiText } from '@hongguo/ui';
import type { Drama, SeriesActor, SeriesDetail } from '@hongguo/core-client';
import type { Store } from './store';

const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9]{1,32}$/.test(id) && /[1-9]/.test(id);
const dramaKey = (drama: Drama) => JSON.stringify([drama.series_id, drama.content_type ?? '']);
const actorKey = (actor: SeriesActor, index: number) =>
  JSON.stringify([actor.actor_id ?? '', actor.name, index]);

interface DetailExtrasProps {
  detail?: SeriesDetail;
  collection: string;
  active: boolean;
  store: Store;
}

/** Season-scoped metadata; switching a collection disposes its return anchors. */
export function DetailExtras(props: DetailExtrasProps) {
  return (
    <Each of={[props.collection]} key={(collection) => collection}>
      {() => (
        <ExtrasContent
          detail={props.detail}
          collection={props.collection}
          active={props.active}
          store={props.store}
        />
      )}
    </Each>
  );
}

function ExtrasContent(props: DetailExtrasProps) {
  const collection = props.collection;
  const target = props.store.target;
  const relatedColumns = () => (target === 'desktop' && windowSize().width <= 800 ? 2 : 4);
  const relatedGap = () => (target === 'tv' ? 12 : 28);
  const width = signal(0);
  const inset = () => (target === 'tv' ? 4 : 8);
  const cardWidth = () =>
    Math.max(
      96,
      (width() - inset() * 2 - (relatedColumns() - 1) * relatedGap()) / relatedColumns(),
    );
  const selected = signal('');
  const refs = new Map<string, ViewRef>();
  let related: ListRef | undefined;
  type FocusedWork = { id: string; columns: number; owns: () => boolean };
  let focusedRelated: FocusedWork | undefined;
  let waiting: { kind: 'actor' | 'related'; id: string; owns: () => boolean } | undefined;
  let frame = 0;
  let disposed = false;
  const enabled = () =>
    !disposed && props.active && lifecycle() === 'active' && props.collection === collection;
  const actors = () => props.detail?.actors ?? [];
  const works = () => props.detail?.related ?? [];
  const rows = () =>
    Array.from({ length: Math.ceil(works().length / relatedColumns()) }, (_, index) => {
      const items = works().slice(index * relatedColumns(), (index + 1) * relatedColumns());
      return { key: dramaKey(items[0]), items };
    });
  const scrollToRelated = (id: string) => {
    const index = works().findIndex((drama) => dramaKey(drama) === id);
    if (index < 0) return false;
    related?.scrollToIndex({
      index: Math.floor(index / relatedColumns()),
      viewPosition: 0.5,
      animated: false,
    });
    return true;
  };
  const restore = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const intent = waiting;
      if (!intent) return;
      if (!enabled() || !intent.owns()) {
        waiting = undefined;
        return;
      }
      const exists =
        intent.kind === 'actor'
          ? actors().some((actor, index) => actorKey(actor, index) === intent.id)
          : works().some((drama) => dramaKey(drama) === intent.id);
      if (!exists) {
        waiting = undefined;
        return;
      }
      const ref = refs.get(`${intent.kind}:${intent.id}`);
      if (!ref) return;
      waiting = undefined;
      ref.reveal({
        vertical: intent.kind === 'related' ? 'center' : 'nearest',
        horizontal: 'nearest',
        animated: false,
      });
      ref.focus();
    });
  };
  const queueSource = (kind: 'actor' | 'related', id: string, owns: () => boolean) => {
    if (!enabled()) return;
    waiting = { kind, id, owns };
    if (kind === 'related' && !scrollToRelated(id)) {
      waiting = undefined;
      return;
    }
    restore();
  };
  const source = (kind: 'actor' | 'related', id: string) => () => {
    queueSource(kind, id, props.store.focusGuard());
  };
  let previousColumns = relatedColumns();
  effect(() => {
    const columns = relatedColumns();
    if (columns === previousColumns) return;
    previousColumns = columns;
    if (!enabled()) return;
    const pending = waiting;
    if (pending?.kind === 'related' && pending.owns()) {
      queueSource('related', pending.id, pending.owns);
      return;
    }
    // Native focus belongs to the recycled slot; after regrouping it must follow the work.
    const focused = focusedRelated;
    if (!focused || !focused.owns()) return;
    queueSource('related', focused.id, () => focusedRelated === focused && focused.owns());
  });
  effect(() => {
    if (!enabled()) {
      focusedRelated = undefined;
      waiting = undefined;
      cancelAnimationFrame(frame);
    } else if (waiting) restore();
  });
  cleanup(() => {
    disposed = true;
    focusedRelated = undefined;
    waiting = undefined;
    cancelAnimationFrame(frame);
    refs.clear();
  });
  return (
    <View testID="detail-extras" class="w-full gap-8">
      <If when={actors().length}>
        <View testID="detail-actors" class="gap-4">
          <UiText role="section">演员</UiText>
          <CardControls label="演员" class="flex-wrap p-2" onNavigate={props.store.noteFocusIntent}>
            <Each
              of={actors().map((actor, index) => ({ actor, index, key: actorKey(actor, index) }))}
              key={(item) => item.key}
            >
              {(item) => {
                let ref: ViewRef | undefined;
                const id = () => item().key;
                effect(() => {
                  const key = `actor:${id()}`;
                  if (ref) refs.set(key, ref);
                  cleanup(() => {
                    if (refs.get(key) === ref) refs.delete(key);
                  });
                });
                return (
                  <If
                    when={validId(item().actor.actor_id)}
                    else={
                      <View
                        testID={
                          target === 'tv'
                            ? `focus-region-detail-actor-name-${item().index}`
                            : undefined
                        }
                        focusable={target === 'tv'}
                        role={target === 'tv' ? 'region' : undefined}
                        accessibilityLabel={target === 'tv' ? item().actor.name : undefined}
                        class="min-w-0"
                        style={{
                          maxWidth: '100%',
                          padding: target === 'tv' ? 4 : undefined,
                        }}
                        onFocus={() => {
                          if (enabled()) props.store.noteFocusIntent();
                        }}
                      >
                        <UiText testID={`detail-actor-name-${item().index}`}>
                          {item().actor.name}
                        </UiText>
                      </View>
                    }
                  >
                    <Button
                      testID={`detail-actor-${item().actor.actor_id}`}
                      label={item().actor.name}
                      labelLines={2}
                      buttonRef={(node) => {
                        ref = node;
                        refs.set(`actor:${id()}`, node);
                        if (waiting?.id === id()) restore();
                      }}
                      onFocus={() => {
                        if (enabled()) {
                          props.store.noteFocusIntent();
                          props.store.rememberSource(source('actor', id()));
                        }
                      }}
                      onPress={() => {
                        const actor = item().actor;
                        if (!enabled() || !validId(actor.actor_id)) return;
                        props.store.noteFocusIntent();
                        props.store.openActor(actor.actor_id, actor.name, source('actor', id()));
                      }}
                    />
                  </If>
                );
              }}
            </Each>
          </CardControls>
        </View>
      </If>
      <If when={works().length}>
        <View
          testID="detail-related-section"
          class="w-full gap-4"
          style={{ maxWidth: target === 'desktop' ? 1100 : undefined }}
          onLayout={({ bounds }) => {
            if (bounds.size.width > 0) width.set(bounds.size.width);
          }}
        >
          <UiText role="section">相关作品</UiText>
          <List
            testID="detail-related"
            ref={(ref) => {
              related = ref;
            }}
            viewport="parent"
            each={rows()}
            keyExtractor={(row) => row.key}
            estimatedItemSize={cardWidth() * 1.35 + (target === 'tv' ? 50 : 84)}
            class="w-full"
            contentStyle={{
              padding: inset(),
              rowGap: relatedGap(),
            }}
            onViewableItemsChange={() => {
              if (waiting) restore();
            }}
          >
            {(row) => (
              // Recycle complete rows with stable column slots, as PosterCollection does.
              // A card must keep an explicit-width layout parent when a row is rebound.
              <View class="w-full flex-row" style={{ columnGap: relatedGap() }}>
                <Each of={Array.from({ length: relatedColumns() }, (_, index) => index)}>
                  {(slot) => (
                    <View class="shrink-0" style={{ width: cardWidth() }}>
                      <If when={row().items[slot()]}>
                        {(drama) => {
                          let ref: ViewRef | undefined;
                          let focused: FocusedWork | undefined;
                          cleanup(() => {
                            // Row slots are rebuilt before the column effect. Preserve only that
                            // layout migration; its original input guard still decides ownership.
                            if (focusedRelated === focused && focused?.columns === relatedColumns())
                              focusedRelated = undefined;
                          });
                          effect(() => {
                            const item = drama();
                            if (!item) return;
                            const key = `related:${dramaKey(item)}`;
                            if (ref) refs.set(key, ref);
                            if (waiting?.id === dramaKey(item)) restore();
                            cleanup(() => {
                              if (refs.get(key) === ref) refs.delete(key);
                            });
                          });
                          return (
                            <View
                              class="w-full flex-1"
                              onLayout={() => {
                                const item = drama();
                                if (item && waiting?.id === dramaKey(item)) restore();
                              }}
                            >
                              <PosterCard
                                testID={`drama-${drama().series_id}`}
                                title={drama().title}
                                cover={drama().cover_fallback || drama().cover}
                                width={cardWidth()}
                                caption={
                                  drama().episode_count ? `${drama().episode_count} 集` : undefined
                                }
                                selected={selected() === dramaKey(drama())}
                                buttonRef={(node) => {
                                  const item = drama();
                                  if (!item) return;
                                  ref = node;
                                  refs.set(`related:${dramaKey(item)}`, node);
                                  if (waiting?.id === dramaKey(item)) restore();
                                }}
                                onFocus={() => {
                                  const item = drama();
                                  if (enabled() && item && validId(item.series_id)) {
                                    props.store.noteFocusIntent();
                                    focused = {
                                      id: dramaKey(item),
                                      columns: relatedColumns(),
                                      owns: props.store.focusGuard(),
                                    };
                                    focusedRelated = focused;
                                    props.store.rememberSource(source('related', dramaKey(item)));
                                  }
                                }}
                                onBlur={() => {
                                  if (focusedRelated === focused) focusedRelated = undefined;
                                  focused = undefined;
                                }}
                                onPress={() => {
                                  const item = drama();
                                  if (!enabled() || !item || !validId(item.series_id)) return;
                                  selected.set(dramaKey(item));
                                  props.store.noteFocusIntent();
                                  if (focusedRelated === focused && focused?.id === dramaKey(item))
                                    focused.owns = props.store.focusGuard();
                                  props.store.open(item, source('related', dramaKey(item)));
                                }}
                              />
                            </View>
                          );
                        }}
                      </If>
                    </View>
                  )}
                </Each>
              </View>
            )}
          </List>
        </View>
      </If>
    </View>
  );
}
