import { List, Text, View, signal, effect, cleanup, type ListRef, type ViewRef } from 'nsh';
import { Controls, Notice, PosterCard, tvUnit } from '@hongguo/ui';
import { type Store } from '../store';
import { SearchForm } from '../SearchForm';

export function Search(props: { store: Store }) {
  const width = signal(0);
  const listHeight = signal(0);
  const columns = () => (props.store.target === 'tv' ? 1 : 4);
  const items = () => props.store.catalog()?.items ?? [];
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  let lastQuery = '';
  effect(() => {
    const query = props.store.query();
    if (query !== lastQuery) {
      lastQuery = query;
      anchor = undefined;
      list?.scrollToOffset({ offset: 0, animated: false });
    }
  });
  const refs = new Map<string, ViewRef>();
  cleanup(() => cancelAnimationFrame(frame));
  const restore = () => {
    if (!anchor) return;
    const index = items().findIndex((drama) => drama.series_id === anchor!.id);
    if (index >= 0)
      list?.scrollToIndex({
        index: Math.floor(index / columns()),
        viewOffset: -anchor.offset,
        animated: false,
      });
  };
  effect(() => {
    if (!props.store.activePage('search')) return;
    void columns();
    frame = requestAnimationFrame(restore);
  });
  return (
    <View
      class={`flex-1 gap-7 ${props.store.target === 'tv' ? '' : 'px-10 pt-7 pb-8'}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32), gap: tvUnit(28) } : undefined}
    >
      <If when={props.store.target !== 'tv'}>
        <Text class="text-3xl font-semibold text-foreground">找剧</Text>
      </If>
      <If when={props.store.target === 'tv'}>
        <View style={{ maxWidth: tvUnit(1100) }}>
          <SearchForm store={props.store} />
        </View>
      </If>
      <If when={!props.store.query()}>
        <Notice message="输入剧名，找到下一部想追的短剧。" />
      </If>
      <If when={props.store.results.loading()}>
        <Text class="text-base text-muted-foreground">正在找剧…</Text>
      </If>
      <If when={props.store.results.error()}>
        <Notice
          error
          message={`搜索失败：${String(props.store.results.error())}`}
          retry={props.store.results.refetch}
        />
      </If>
      <If when={props.store.query() && props.store.results.state() === 'ready' && !items().length}>
        <Notice message="没有找到，试试其他关键词。" />
      </If>
      <List
        ref={(ref) => {
          list = ref;
        }}
        onScroll={() => {
          if (!props.store.activePage('search')) return;
          void list?.measureScrollPosition().then((position) => {
            if (props.store.activePage('search') && position) {
              const item = items()[position.index * columns()];
              if (item) anchor = { id: item.series_id, offset: position.offset };
            }
          });
        }}
        onLayout={({ bounds }) => {
          if (bounds.size.height > 0) listHeight.set(bounds.size.height);
          if (bounds.size.width > 0) width.set(bounds.size.width);
        }}
        testID="results"
        each={Array.from({ length: Math.ceil(items().length / columns()) }, (_, i) => ({
          id: items()[i * columns()].series_id,
          items: items().slice(i * columns(), (i + 1) * columns()),
        }))}
        keyExtractor={(row) => row.id}
        horizontal={props.store.target === 'tv'}
        estimatedItemSize={
          props.store.target === 'tv' ? tvUnit(260) : ((width() - 84) / 4) * 1.35 + 84
        }
        class="flex-1"
        style={props.store.target === 'desktop' ? { width: '100%', maxWidth: 1100 } : undefined}
        contentStyle={{ gap: props.store.target === 'tv' ? tvUnit(28) : 28 }}
      >
        {(row) => (
          <View style={props.store.target === 'tv' ? { width: tvUnit(260) } : undefined}>
            <Controls label="搜索结果" class="w-full gap-7">
              <Each of={Array.from({ length: columns() }, (_, i) => i)}>
                {(slot) => (
                  <View class="flex-1">
                    <If when={row().items[slot()]}>
                      {(drama) => {
                        let ref: ViewRef | undefined;
                        effect(() => {
                          const id = drama().series_id;
                          if (ref) refs.set(id, ref);
                          cleanup(() => refs.delete(id));
                        });
                        return (
                          <PosterCard
                            buttonRef={(node) => {
                              ref = node;
                              refs.set(drama().series_id, node);
                            }}
                            testID={`drama-${drama().series_id}`}
                            availableHeight={listHeight()}
                            width={(width() - 84) / 4 - 4}
                            title={drama().title}
                            cover={drama().cover_fallback || drama().cover}
                            caption={
                              drama().episode_count ? `${drama().episode_count} 集` : undefined
                            }
                            onPress={() => {
                              props.store.searchSelection.set(drama().series_id);
                              const id = drama().series_id;
                              props.store.open(drama(), () => {
                                restore();
                                frame = requestAnimationFrame(() =>
                                  (refs.get(id) ?? refs.values().next().value)?.focus(),
                                );
                              });
                            }}
                            selected={props.store.searchSelection() === drama().series_id}
                          />
                        );
                      }}
                    </If>
                  </View>
                )}
              </Each>
            </Controls>
          </View>
        )}
      </List>
      <If when={props.store.catalog()?.has_more}>
        <Text
          style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          class="text-sm text-muted-foreground"
        >
          当前显示首批结果，可用更具体的关键词查找。
        </Text>
      </If>
    </View>
  );
}
