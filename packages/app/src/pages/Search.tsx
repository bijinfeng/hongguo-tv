import { Text, View, Scroll, fontScale, type ViewRef } from 'nsh';
import { BackButton, Button, Controls, Notice, UiText } from '@hongguo/ui';
import { PosterCollection } from '../PosterCollection';
import { type Store } from '../store';
import { SearchForm, SearchKeyboard } from '../SearchForm';
import { SearchHistory } from './search/SearchHistory';
import { errorMessage } from '../error-messages';
import { desktopContentFrame } from '../shell/ContentColumn';

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
  const tv = props.store.target === 'tv';
  return (
    <View
      class="flex-1 min-h-0"
      style={
        tv
          ? { gap: 16 }
          : { ...desktopContentFrame({ top: 24 }), gap: props.store.query() ? 28 : 16 }
      }
    >
      <If when={props.store.searchFromCategory()}>
        <BackButton
          testID="search-back"
          label={props.store.backLabel()}
          onPress={props.store.back}
        />
      </If>
      <View class={tv ? 'flex-1 min-h-0 flex-row' : 'flex-1 min-h-0'} style={{ gap: tv ? 24 : 16 }}>
        <If when={tv}>
          <View class="min-h-0" style={{ width: fontScale() >= 1.25 ? 332 : 292, gap: 16 }}>
            <SearchForm store={props.store} />
            <Scroll
              class="flex-1 min-h-0"
              testID="search-editor-scroll"
              contentStyle={{ gap: 24, padding: 6 }}
            >
              <SearchKeyboard store={props.store} />
              <SearchHistory store={props.store} />
            </Scroll>
          </View>
        </If>
        <View class="flex-1 min-w-0 min-h-0" style={{ gap: tv ? 12 : 16 }}>
          <View class="flex-row flex-wrap items-center justify-between" style={{ gap: 8 }}>
            <UiText role="page">{tv ? '搜索' : '找剧'}</UiText>
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
          <If when={!tv}>
            <SearchHistory store={props.store} />
          </If>
          {/* A kept result from the previous keyword must say so, and must say which state it is in:
          the failure notice below already carries the error, so this line never claims progress. */}
          <If
            when={props.store.query() && props.store.resultsStale() && !props.store.results.error()}
          >
            <Notice
              message={
                props.store.results.loading()
                  ? '这些还是上一个关键词的结果，新结果正在加载。'
                  : '这些还是上一个关键词的结果。'
              }
            />
          </If>
          <If
            when={
              props.store.query() && props.store.results.loading() && !props.store.resultsStale()
            }
          >
            <Text class="text-base text-muted-foreground">正在找剧…</Text>
          </If>
          <If when={props.store.query() && errorMessage(props.store.results.error(), '搜索失败')}>
            <Notice
              error
              message={errorMessage(props.store.results.error(), '搜索失败')}
              retry={props.store.results.refetch}
            />
          </If>
          <If
            when={props.store.query() && props.store.results.state() === 'ready' && !items().length}
          >
            <Notice message="没有找到，试试其他关键词。" />
          </If>
          <If when={!props.store.query()}>
            <If when={suggestions().length || discoveries().length}>
              <UiText role="section">{discoveryTitle()}</UiText>
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
                          .join('') +
                        (Array.from(item().query || item().title).length > 18 ? '…' : '')
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
                style={props.store.target === 'tv' ? { fontSize: 12 } : undefined}
              >
                暂时没有推荐内容
              </Text>
            </If>
          </If>
          <PosterCollection
            onEmptyFocus={props.store.focusSearchInput}
            onNavigate={props.store.noteFocusIntent}
            focusGuard={props.store.focusGuard}
            density="search"
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
                onFocusedRemoval={restoreTerminalFocus}
              />
            </View>
          </If>
        </View>
      </View>
    </View>
  );
}
