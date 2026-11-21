import { Select } from 'nsh/base';
import { View, signal, windowSize } from 'nsh';
import {
  Button,
  CardControls,
  Notice,
  PosterCard,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
} from '@hongguo/ui';
import type { Store } from '../../store';

/** Fluid poster grid: keep desktop cards near 180px and add columns as the window grows. */
const minCard = 180;
const columnGap = 20;

function gutter() {
  return Math.min(64, Math.max(24, windowSize().width * 0.035));
}

/** Content width after the 176px rail and the shared content-column inset. */
function gridWidth() {
  const available = windowSize().width - 176;
  const inset = Math.max(gutter(), (available - 1660) / 2);
  return Math.max(0, available - inset * 2);
}

function columns(store: Store) {
  if (store.target === 'tv') return 4;
  const count = Math.floor((gridWidth() + columnGap) / (minCard + columnGap));
  return Math.max(2, Math.min(8, count));
}

function cardWidth(store: Store) {
  if (store.target === 'tv') return 326;
  const count = columns(store);
  const usable = gridWidth() - (count - 1) * columnGap;
  return Math.max(150, Math.floor(usable / count));
}

/** Filter chips own the query; keep controls grouped above the grid and wrap when space is tight. */
function CatalogFilters(props: { store: Store }) {
  const catalog = props.store.homeCatalog;
  const sortOpen = signal(false);
  const sortChoices = () => catalog.choices('sort');
  const sortTitle = () =>
    sortChoices().find((choice) => choice.value === catalog.selection().sort)?.title ?? '综合';
  return (
    <View class="flex-row min-w-0 flex-wrap items-start" style={{ gap: 7, marginBottom: 22 }}>
      <CardControls
        label="题材"
        onNavigate={props.store.noteFocusIntent}
        gap={7}
        class="min-w-0 flex-1 flex-wrap"
      >
        <Each of={catalog.choices('category_dim_theme')} key={(choice) => `theme-${choice.value}`}>
          {(choice) => (
            <Button
              label={choice().title}
              size="sm"
              variant="quiet"
              style={{ borderRadius: 6, minWidth: 52 }}
              selected={catalog.selection().category_dim_theme === choice().value}
              testID={`home-filter-theme-${choice().value || 'all'}`}
              onPress={() => catalog.change('category_dim_theme', choice().value)}
            />
          )}
        </Each>
      </CardControls>
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
            icon="down"
            size="sm"
            variant="quiet"
            selectOpen={sortOpen()}
            style={{ minWidth: 132 }}
            onPress={() => sortOpen.set(true)}
          />
        }
        popupClass="bg-popover border border-border rounded-(--radius) p-2"
        popupStyle={{ minWidth: 180 }}
        itemClass="text-popover-foreground rounded-lg hover:bg-muted focus:bg-accent selected:bg-accent"
        itemStyle={{ minHeight: 36, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 }}
      />
    </View>
  );
}

/** Filter geometry before the first catalog page arrives; the grid owns the announcement. */
function FilterSkeleton() {
  return (
    <View
      accessibilityElementsHidden
      class="flex-row min-w-0 flex-wrap items-center justify-between"
      style={{ gap: 7, marginBottom: 22 }}
    >
      <View class="flex-row min-w-0 flex-wrap items-center" style={{ gap: 7 }}>
        <Each of={[52, 64, 56, 60]}>
          {(width) => <SkeletonBlock width={width()} height={36} radius={6} />}
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
      style={{ gap: columnGap }}
    >
      <Each
        of={Array.from({ length: columns(props.store) * 3 }, (_, index) => index)}
        key={(index: number) => `poster-${index}`}
      >
        {() => (
          <View accessibilityElementsHidden style={{ width: width(), gap: tv() ? 7 : 12 }}>
            <SkeletonBlock width={width()} height={width() * 1.35} radius={tv() ? 6 : 12} />
            <View style={{ gap: 4 }}>
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
    <View class="items-start" style={{ gap: 12, paddingVertical: tv() ? 12 : 24 }}>
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
      <View class="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
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
        <View class="flex-row flex-wrap" style={{ gap: columnGap }}>
          {/* All loaded pages are rendered: the header counts them and 查看更多 appends to them. */}
          <Each of={items()} key={(drama) => drama.series_id}>
            {(drama) => (
              <View style={{ width: cardWidth(props.store) }}>
                <PosterCard
                  testID={`home-poster-${drama().series_id}`}
                  title={drama().title}
                  cover={drama().cover_fallback || drama().cover}
                  caption={drama().episode_count ? `全 ${drama().episode_count} 集` : undefined}
                  width={cardWidth(props.store)}
                  onPress={() => props.store.open(drama(), () => props.store.restoreFocus())}
                />
              </View>
            )}
          </Each>
        </View>
      </If>
      {/* The cause comes first, then the action that retries the same cursor. */}
      <If when={!!catalog.error() && !!data() && !catalog.stale()}>
        <View style={{ marginTop: 16 }}>
          <Notice error message={catalog.error()} testID="home-catalog-more-error" />
        </View>
      </If>
      <If when={data()?.has_more && !catalog.stale()}>
        <View class="items-end" style={{ marginTop: 16 }}>
          <Button
            label={catalog.error() ? '重试加载更多' : '查看更多'}
            displayLabel={catalog.loading() ? '正在加载…' : undefined}
            pending={catalog.loading()}
            variant="quiet"
            size="sm"
            icon="forward"
            testID="home-catalog-more"
            onPress={() => (catalog.error() ? catalog.retry() : catalog.loadMore())}
          />
        </View>
      </If>
      {/* TV has no sidebar, so the home page carries these entries there. */}
      <If when={tv()}>
        <View style={{ marginTop: 24 }}>
          <CardControls label="更多发现" onNavigate={props.store.noteFocusIntent} gap={10}>
            <Button
              label="排行榜"
              icon="chart-no-axes-column-increasing"
              variant="quiet"
              testID="home-rankings"
              onPress={() => {
                props.store.navigate('rankings');
                props.store.restoreFocus();
              }}
            />
            <Button
              label="上新日历"
              icon="calendar-days"
              variant="quiet"
              testID="home-calendar"
              onPress={() => {
                props.store.navigate('calendar');
                props.store.restoreFocus();
              }}
            />
            <Button
              label="查看全部"
              icon="search"
              variant="quiet"
              testID="home-catalog-all"
              onPress={() => {
                props.store.navigate('discover');
                props.store.restoreFocus();
              }}
            />
          </CardControls>
        </View>
      </If>
    </View>
  );
}
