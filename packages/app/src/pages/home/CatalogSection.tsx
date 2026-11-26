import { ChevronDown, ChevronRight } from 'nsh-icon-lucide';
import { Select } from 'nsh/base';
import { View, signal, windowSize } from 'nsh';
import {
  Button,
  ChoiceList,
  Notice,
  PosterCard,
  SelectItemLabel,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  space,
  radius,
  selectItemClass,
  selectItemLineHeight,
} from '@hongguo/ui';
import type { Store } from '../../store';
import { tvColumns, tvInsets } from '../../shell/tv-layout';
import { PosterCollection } from '../../PosterCollection';

import { POSTER_GAP, posterGrid } from '../../shell/poster-grid';

const columnGap = POSTER_GAP;
function columns(store: Store) {
  return store.target === 'tv' ? tvColumns('collection') : posterGrid(store.target).columns;
}
function cardWidth(store: Store) {
  if (store.target !== 'tv') return posterGrid(store.target).cardWidth;
  const insets = tvInsets();
  const available = windowSize().width - insets.left - insets.right;
  return Math.max(1, Math.floor((available - (columns(store) - 1) * 16) / columns(store)));
}

/** Filter chips own the query; the shared option row wraps before the grid. */
function CatalogFilters(props: { store: Store }) {
  const catalog = props.store.homeCatalog;
  const sortOpen = signal(false);
  const sortChoices = () => catalog.choices('sort');
  const sortTitle = () =>
    sortChoices().find((choice) => choice.value === catalog.selection().sort)?.title ?? '综合';
  return (
    <View style={{ marginBottom: space('lg') }}>
      <View class="flex-row min-w-0 flex-wrap items-start" style={{ gap: space('xs') }}>
        <View class="min-w-0 flex-1">
          <ChoiceList
            label="题材"
            value={catalog.selection().category_dim_theme}
            items={catalog.choices('category_dim_theme')}
            testID="home-filter-theme"
            onNavigate={props.store.noteFocusIntent}
            onChange={(value) => catalog.change('category_dim_theme', value)}
          />
        </View>
        <Select
          testID="home-filter-sort"
          accessibilityLabel="排序方式"
          value={catalog.selection().sort}
          open={sortOpen()}
          onOpenChange={({ open }) => sortOpen.set(open)}
          items={sortChoices()}
          onChange={({ value }) => {
            if (value !== null) {
              props.store.noteFocusIntent();
              catalog.change('sort', value);
            }
          }}
          trigger={
            <Button
              label="排序方式"
              displayLabel={sortTitle()}
              icon={ChevronDown}
              size="sm"
              variant="quiet"
              selectOpen={sortOpen()}
              style={{ minWidth: 132 }}
              onPress={() => sortOpen.set(true)}
            />
          }
          popupClass="bg-popover border border-border rounded-(--radius) p-2"
          popupStyle={{ minWidth: 180 }}
          itemClass={selectItemClass()}
          itemStyle={{
            minHeight: 36,
            fontSize: 14,
            lineHeight: selectItemLineHeight(14),
            paddingHorizontal: space('sm'),
            paddingVertical: space('xs'),
            borderRadius: radius('lg'),
          }}
          renderItem={(entry) => <SelectItemLabel entry={entry} />}
        />
      </View>
    </View>
  );
}

/** Filter geometry before the first catalog page arrives; the grid owns the announcement. */
function FilterSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      class="flex-row min-w-0 flex-wrap items-center justify-between"
      style={{ gap: space('xs'), marginBottom: space('lg'), paddingVertical: space('xxs') }}
    >
      <View class="flex-row min-w-0 flex-wrap items-center" style={{ gap: space('xs') }}>
        <Each of={[52, 64, 56, 60]}>
          {(width) => <SkeletonBlock width={width()} height={32} radius={8} />}
        </Each>
      </View>
      <SkeletonBlock width={132} height={36} radius={6} />
    </View>
  );
}

/** Poster cards keep the loaded geometry: cover, one title row and one caption row. */
function PosterSkeleton(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const width = () => cardWidth(props.store);
  return (
    <SkeletonRegion
      label="正在加载片库"
      testID="home-catalog-pending"
      class="flex-row flex-wrap"
      style={{ gap: tv() ? 16 : columnGap }}
    >
      <Each
        of={Array.from({ length: columns(props.store) * (tv() ? 1 : 3) }, (_, index) => index)}
        key={(index: number) => `poster-${index}`}
      >
        {() => (
          <View accessibilityElementsHidden style={{ width: width(), gap: tv() ? 7 : 12 }}>
            <SkeletonBlock width={width()} height={width() * 1.35} radius={tv() ? 6 : 12} />
            <View style={{ gap: space('xxs') }}>
              <View class="justify-center" style={{ height: tv() ? 18 : 27 }}>
                <SkeletonBlock width="72%" height={tv() ? 9 : 14} radius={4} />
              </View>
              <View class="justify-center" style={{ height: tv() ? 15 : 21 }}>
                <SkeletonBlock width="42%" height={tv() ? 8 : 12} radius={4} />
              </View>
            </View>
          </View>
        )}
      </Each>
    </SkeletonRegion>
  );
}

/** A failed catalog keeps its filters above and offers one retry in place. */
function CatalogFailure(props: { store: Store }) {
  const catalog = props.store.homeCatalog;
  return (
    <Notice
      title="片库加载失败"
      message={catalog.error()}
      error
      retry={() => catalog.retry()}
      testID="home-catalog-retry"
    />
  );
}

/** The settled empty page: no data, no failure, filters stay for recovery. */
function CatalogEmpty(props: { store: Store }) {
  const catalog = props.store.homeCatalog;
  const tv = () => props.store.target === 'tv';
  return (
    <View
      class="items-start"
      style={{ gap: space('sm'), paddingVertical: tv() ? space('sm') : space('lg') }}
    >
      <UiText role="title">暂时没有找到这部剧</UiText>
      <UiText role="meta" lines={2}>
        {catalog.selection().category_dim_theme || catalog.selection().genre
          ? '换一个题材，或重置筛选看看全部剧。'
          : '片库正在更新，稍后再来。'}
      </UiText>
      <Button
        label="重置筛选"
        variant="quiet"
        testID="home-catalog-reset"
        onPress={() => catalog.clear()}
      />
    </View>
  );
}

/** “今晚，想看什么”: draft chips, poster grid and the discover entries. */
export function CatalogSection(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const catalog = props.store.homeCatalog;
  const data = () => catalog.data();
  const items = () => data()?.items ?? [];
  const unresolved = () => !data() && !catalog.error();
  const failed = () => !!catalog.error() && (!data() || catalog.stale());
  const blank = () => unresolved() || (catalog.stale() && items().length === 0);
  const counting = () => !failed() && items().length > 0;
  const upToDate = () => !blank() && !failed();
  return (
    <View>
      <View class="flex-row items-center justify-between" style={{ marginBottom: tv() ? 4 : 16 }}>
        <UiText role={tv() ? 'section' : 'title'}>今晚，想看什么</UiText>
        <If when={!tv() && counting()}>
          <UiText role="meta">
            {catalog.loading() && catalog.stale() ? '正在更新…' : `${items().length} 部剧`}
          </UiText>
        </If>
      </View>
      <If when={!tv() && !data() && !catalog.error()}>
        <FilterSkeleton />
      </If>
      <If when={!tv() && !!data()}>
        <CatalogFilters store={props.store} />
      </If>
      <If when={blank()}>
        <PosterSkeleton store={props.store} />
      </If>
      <If when={failed()}>
        <CatalogFailure store={props.store} />
      </If>
      <If when={upToDate() && items().length === 0}>
        <CatalogEmpty store={props.store} />
      </If>
      <If when={upToDate() && items().length > 0}>
        <If
          when={tv()}
          else={
            <View class="flex-row flex-wrap" style={{ gap: tv() ? 16 : columnGap }}>
              {/* All loaded pages are rendered: the header counts them and 查看更多 appends to them. */}
              <Each of={items()} key={(drama) => drama.series_id}>
                {(drama) => (
                  <View style={{ width: cardWidth(props.store) }}>
                    <PosterCard
                      density={tv() ? 'compact' : undefined}
                      testID={`home-poster-${drama().series_id}`}
                      title={drama().title}
                      cover={drama().cover_fallback || drama().cover}
                      caption={drama().episode_count ? `全 ${drama().episode_count} 集` : undefined}
                      fit={tv() ? 'contain' : undefined}
                      width={tv() ? Math.min(132, cardWidth(props.store)) : cardWidth(props.store)}
                      onPress={() => props.store.open(drama(), () => props.store.restoreFocus())}
                    />
                  </View>
                )}
              </Each>
            </View>
          }
        >
          <PosterCollection
            onEmptyFocus={props.store.focusPrimary}
            target="tv"
            layout="shelf"
            active={props.store.activePage('home')}
            testID="home-catalog-shelf"
            itemTestIDPrefix="home-poster"
            items={items()}
            collection={`home:${catalog.key()}`}
            label="精选短剧"
            selected=""
            caption={(drama) => (drama.episode_count ? `全 ${drama.episode_count} 集` : undefined)}
            onNavigate={props.store.noteFocusIntent}
            focusGuard={props.store.focusGuard}
            onSource={props.store.rememberSource}
            onOpen={(drama, restore) => props.store.open(drama, restore)}
          />
        </If>
      </If>
      {/* The cause comes first, then the action that retries the same cursor. */}
      <If when={!!catalog.error() && !!data() && !catalog.stale()}>
        <View style={{ marginTop: space('md') }}>
          <Notice error message={catalog.error()} testID="home-catalog-more-error" />
        </View>
      </If>
      <If when={!tv() && data()?.has_more && !catalog.stale()}>
        <View class="items-end" style={{ marginTop: space('md') }}>
          <Button
            label={catalog.error() ? '重试加载更多' : '查看更多'}
            displayLabel={catalog.loading() ? '正在加载…' : undefined}
            pending={catalog.loading()}
            variant="quiet"
            size="sm"
            icon={ChevronRight}
            testID="home-catalog-more"
            onPress={() => (catalog.error() ? catalog.retry() : catalog.loadMore())}
          />
        </View>
      </If>
      <If when={tv()}>
        <View class="items-end" style={{ marginTop: space('lg') }}>
          <Button
            label="查看全部"
            icon={ChevronRight}
            variant="quiet"
            testID="home-catalog-all"
            onPress={() => {
              props.store.navigate('discover');
              props.store.restoreFocus();
            }}
          />
        </View>
      </If>
    </View>
  );
}
