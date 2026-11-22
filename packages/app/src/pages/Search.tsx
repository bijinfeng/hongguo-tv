import { Text, View, signal, type ViewRef } from 'nsh';
import { BackButton, Button, ConfirmDialog, Controls, Notice, UiText } from '@hongguo/ui';
import { PosterCollection } from '../PosterCollection';
import { type Store } from '../store';
import { SearchForm } from '../SearchForm';
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
  /** Search history is cleared only after the scope is named back to the user. */
  const confirmClear = signal(false);
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
      class="flex-1"
      style={
        props.store.target === 'tv'
          ? { paddingTop: 16, gap: 14 }
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
      <If when={props.store.target !== 'tv'}>
        <View class="flex-row items-center justify-between">
          <UiText role="page">找剧</UiText>
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
        <View class="flex-row items-center justify-between" style={{ gap: 14 }}>
          <View class="flex-1" style={{ maxWidth: 550 }}>
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
        <View class="gap-4" style={props.store.target === 'tv' ? { gap: 10 } : undefined}>
          <View class="flex-row items-center justify-between">
            <UiText role="section">最近搜索</UiText>
            <If when={props.store.recent.items().length}>
              <Button
                testID="clear-recent-searches"
                label="清空搜索记录"
                variant="quiet"
                compact
                disabled={props.store.recent.saving()}
                onPress={() => confirmClear.set(true)}
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
              style={props.store.target === 'tv' ? { fontSize: 12 } : undefined}
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
      {/* A kept result from the previous keyword must say so, and must say which state it is in:
          the failure notice below already carries the error, so this line never claims progress. */}
      <If when={props.store.query() && props.store.resultsStale() && !props.store.results.error()}>
        <Notice
          message={
            props.store.results.loading()
              ? '这些还是上一个关键词的结果，新结果正在加载。'
              : '这些还是上一个关键词的结果。'
          }
        />
      </If>
      <If
        when={props.store.query() && props.store.results.loading() && !props.store.resultsStale()}
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
      <If when={props.store.query() && props.store.results.state() === 'ready' && !items().length}>
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
            style={props.store.target === 'tv' ? { fontSize: 12 } : undefined}
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
            onFocusedRemoval={restoreTerminalFocus}
          />
        </View>
      </If>
      <ConfirmDialog
        testID="clear-recent-confirm"
        open={confirmClear()}
        title="清空搜索记录？"
        description="只清空本机的最近搜索关键词；观看记录、收藏和各账号数据不受影响。"
        destructive
        confirmLabel="清空搜索记录"
        pending={props.store.recent.clearing()}
        // Only a clear failure belongs in this dialog; a previous save error is not this action's.
        error={confirmClear() && props.store.recent.clearing() ? props.store.recent.error() : ''}
        onOpenChange={(event) => {
          if (!event.open) confirmClear.set(false);
        }}
        returnFocus={() => props.store.focusSearchInput()}
        onConfirm={() => {
          // Close once the write settles so a failure stays readable in the dialog's error slot.
          void props.store.recent.clear().then(() => {
            if (!props.store.recent.error()) {
              props.store.focusSearchInput();
              confirmClear.set(false);
            }
          });
        }}
      />
    </View>
  );
}
