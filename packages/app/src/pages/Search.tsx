import { Text, View, platform, type ViewRef } from 'nsh';
import { Button, Controls, Notice, tvUnit } from '@hongguo/ui';
import { PosterCollection } from '../PosterCollection';
import { type Store } from '../store';
import { SearchForm } from '../SearchForm';

export function Search(props: { store: Store }) {
  const discoveries = () => {
    const seen = new Set<string>();
    return (props.store.discoveryData()?.boards ?? [])
      .flatMap((board) => board.items)
      .filter((item) => {
        if (!item.series_id || seen.has(item.series_id)) return false;
        seen.add(item.series_id);
        return true;
      });
  };
  const discoveryFamily = (id: string) =>
    (props.store.discoveryData()?.boards ?? []).find((board) =>
      board.items.some((item) => item.series_id === id),
    )?.id;
  const suggestions = () => {
    const seen = new Set(props.store.recent.items());
    return (props.store.discoveryData()?.guesses ?? []).filter((item) => {
      const query = item.query || item.title;
      if (!query || seen.has(query)) return false;
      seen.add(query);
      return true;
    });
  };
  const items = () => (props.store.query() ? (props.store.catalog()?.items ?? []) : discoveries());
  const discoveryTitle = () => {
    if (props.store.target === 'tv') return '试试这些故事';
    if (!discoveries().length) return '试试这些';
    const short = discoveries().some((item) => discoveryFamily(item.series_id) === 'short');
    const comic = discoveries().some((item) => discoveryFamily(item.series_id) === 'comic');
    return short && comic ? '热门短剧与漫剧' : comic ? '热门漫剧' : '热门短剧';
  };
  let more: ViewRef | undefined;
  let continuationQuery = '';
  const loadMore = () => {
    continuationQuery = props.store.query();
    more?.focus();
    void props.store.loadMore();
  };

  const restoreTerminalFocus = () => {
    if (
      props.store.activePage('search') &&
      props.store.query() === continuationQuery &&
      props.store.results.state() === 'ready' &&
      props.store.catalog()?.has_more === false &&
      !props.store.moreError()
    )
      props.store.focusSearchInput();
  };
  return (
    <View
      class={`flex-1 ${props.store.query() ? 'gap-7' : 'gap-4'} ${props.store.target === 'tv' ? '' : 'px-10 pt-7 pb-8'}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32), gap: tvUnit(28) } : undefined}
    >
      <If when={props.store.searchFromCategory()}>
        <View class="items-start">
          <Button
            testID="search-back"
            label="返回找剧"
            icon="back"
            variant="quiet"
            compact
            onPress={props.store.back}
          />
        </View>
      </If>
      <If when={props.store.target !== 'tv'}>
        <View class="flex-row items-center justify-between">
          <Text class="text-3xl font-semibold text-foreground">找剧</Text>
          <If when={props.store.query()}>
            <Button
              testID="clear-query"
              label="清除搜索"
              variant="quiet"
              compact
              onPress={props.store.clearQuery}
            />
          </If>
        </View>
      </If>
      <If when={props.store.target === 'tv'}>
        <View class="flex-row items-center justify-between" style={{ gap: tvUnit(28) }}>
          <View class="flex-1" style={{ maxWidth: tvUnit(1100) }}>
            <SearchForm store={props.store} />
          </View>
          <If when={props.store.query()}>
            <Button
              testID="clear-query"
              label="清除搜索"
              variant="quiet"
              onPress={props.store.clearQuery}
            />
          </If>
        </View>
      </If>
      <If when={!props.store.query()}>
        <View class="gap-4" style={props.store.target === 'tv' ? { gap: tvUnit(20) } : undefined}>
          <View class="flex-row items-center justify-between">
            <Text
              class="font-semibold text-foreground"
              style={{ fontSize: props.store.target === 'tv' ? tvUnit(30) : 20 }}
            >
              最近搜索
            </Text>
            <If when={props.store.recent.items().length}>
              <Button
                testID="clear-recent-searches"
                label={props.store.recent.clearing() ? '正在清空…' : '清空记录'}
                variant="quiet"
                compact
                disabled={props.store.recent.saving()}
                onPress={() => {
                  props.store.focusSearchInput();
                  void props.store.recent.clear();
                }}
              />
            </If>
          </View>
          <Controls label="最近搜索">
            <Each of={props.store.recent.items()} key={(term) => term}>
              {(term) => (
                <Button
                  label={term()}
                  testID={`recent-search-${term()}`}
                  compact
                  displayLabel={
                    Array.from(term()).length > 18
                      ? Array.from(term()).slice(0, 18).join('') + '…'
                      : term()
                  }
                  onPress={() => {
                    props.store.draft.set(term());
                    props.store.submit();
                  }}
                />
              )}
            </Each>
          </Controls>
          <If when={props.store.recent.loading() && !props.store.recent.ready()}>
            <Text class="text-base text-muted-foreground">正在加载…</Text>
          </If>
          <If when={props.store.recent.ready() && !props.store.recent.items().length}>
            <Text
              class="text-base text-muted-foreground"
              style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
            >
              暂无搜索记录
            </Text>
          </If>
        </View>
      </If>
      <If when={props.store.recent.error()}>
        <Notice
          error
          message={props.store.recent.error()}
          retryLabel={props.store.recent.retryLabel()}
          retry={() => {
            void props.store.recent.retry();
          }}
        />
      </If>
      <If when={props.store.query() && props.store.results.loading()}>
        <Text class="text-base text-muted-foreground">正在找剧…</Text>
      </If>
      <If when={props.store.query() && props.store.results.error()}>
        <Notice
          error
          message={`搜索失败：${String(props.store.results.error())}`}
          retry={props.store.results.refetch}
        />
      </If>
      <If when={props.store.query() && props.store.results.state() === 'ready' && !items().length}>
        <Notice message="没有找到，试试其他关键词。" />
      </If>
      <If when={!props.store.query()}>
        <If when={suggestions().length || discoveries().length}>
          <Text
            class="font-semibold text-foreground"
            style={{ fontSize: props.store.target === 'tv' ? tvUnit(30) : 20 }}
          >
            {discoveryTitle()}
          </Text>
        </If>
        <If when={suggestions().length}>
          <Controls label="搜索建议">
            <Each of={suggestions()} key={(item) => item.query || item.title}>
              {(item) => (
                <Button
                  testID={`discovery-query-${item().query || item().title}`}
                  label={item().query || item().title}
                  compact
                  displayLabel={
                    Array.from(item().query || item().title)
                      .slice(0, 18)
                      .join('') + (Array.from(item().query || item().title).length > 18 ? '…' : '')
                  }
                  onPress={() => {
                    props.store.draft.set(item().query || item().title);
                    props.store.submit();
                  }}
                />
              )}
            </Each>
          </Controls>
        </If>
        <If when={props.store.discovery.loading() && !props.store.discoveryData()}>
          <Text class="text-base text-muted-foreground">正在加载…</Text>
        </If>
        <If when={props.store.discovery.error()}>
          <Notice error message="热门内容未能加载" retry={props.store.discovery.refetch} />
        </If>
        <If
          when={
            props.store.discovery.state() === 'ready' &&
            !discoveries().length &&
            !suggestions().length
          }
        >
          <Text
            class="text-base text-muted-foreground"
            style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
          >
            暂时没有推荐内容
          </Text>
        </If>
      </If>
      <PosterCollection
        onNavigate={props.store.noteFocusIntent}
        focusGuard={props.store.focusGuard}
        target={props.store.target}
        active={props.store.activePage('search')}
        testID="results"
        collection={props.store.query()}
        items={items()}
        label={props.store.query() ? '搜索结果' : discoveryTitle()}
        selected={props.store.searchSelection()}
        caption={(drama) =>
          [
            !props.store.query() && discoveryFamily(drama.series_id) === 'comic' ? '漫剧' : '',
            drama.episode_count ? `${drama.episode_count} 集` : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined
        }
        onOpen={(drama, restore) => {
          props.store.searchSelection.set(drama.series_id);
          props.store.open(drama, restore);
        }}
      />

      <If when={props.store.moreError()}>
        <Notice error message={props.store.moreError()} />
      </If>
      <If when={props.store.query() && props.store.catalog()?.has_more}>
        <View class="items-start">
          <Button
            buttonRef={(ref) => {
              more = ref;
            }}
            testID="search-more"
            label={
              props.store.loadingMore()
                ? '正在加载…'
                : props.store.moreError()
                  ? '重试'
                  : '加载更多'
            }
            disabled={props.store.results.state() !== 'ready'}
            onPress={loadMore}
            onFocusedRemoval={platform.os === 'macos' ? restoreTerminalFocus : undefined}
          />
        </View>
      </If>
    </View>
  );
}
