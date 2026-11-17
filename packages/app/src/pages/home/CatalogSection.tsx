import { Select } from 'nsh/base';
import { View, signal, windowSize } from 'nsh';
import { Button, CardControls, PosterCard, UiText, tvUnit } from '@hongguo/ui';
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

function CatalogPlaceholder(props: { store: Store }) {
  const catalog = props.store.homeCatalog;
  const tv = () => props.store.target === 'tv';
  return (
    <If
      when={catalog.loading()}
      else={
        <If
          when={catalog.error()}
          else={
            <View class="items-start" style={{ gap: 12, paddingVertical: tv() ? tvUnit(24) : 24 }}>
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
          }
        >
          <View class="items-start" style={{ gap: 12, paddingVertical: tv() ? tvUnit(24) : 24 }}>
            <UiText role="title">片库加载失败</UiText>
            <UiText role="meta" lines={2}>
              {catalog.error()}
            </UiText>
            <Button label="重试" testID="home-catalog-retry" onPress={() => catalog.retry()} />
          </View>
        </If>
      }
    >
      <View class="flex-row flex-wrap" style={{ gap: columnGap }}>
        <Each
          of={Array.from({ length: columns(props.store) * 3 }, (_, index) => index)}
          key={(index: number) => `skeleton-${index}`}
        >
          {() => (
            <View
              class="rounded-(--radius) bg-muted"
              style={{ width: cardWidth(props.store), height: cardWidth(props.store) * 1.35 }}
            />
          )}
        </Each>
      </View>
    </If>
  );
}

/** “今晚，想看什么”: draft chips, poster grid and the discover entries. */
export function CatalogSection(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const catalog = props.store.homeCatalog;
  const items = () => catalog.data()?.items ?? [];
  return (
    <View>
      <View class="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
        <UiText role={tv() ? 'section' : 'title'}>今晚，想看什么</UiText>
        <If when={!tv() && items().length > 0}>
          <UiText role="meta">{`${items().length} 部剧`}</UiText>
        </If>
      </View>
      <If when={!tv()}>
        <CatalogFilters store={props.store} />
      </If>
      <If when={items().length > 0} else={<CatalogPlaceholder store={props.store} />}>
        <View class="flex-row flex-wrap" style={{ gap: columnGap }}>
          <Each of={items().slice(0, columns(props.store) * 3)} key={(drama) => drama.series_id}>
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
      <If when={catalog.data()?.has_more}>
        <View class="items-end" style={{ marginTop: 16 }}>
          <Button
            label={catalog.loading() ? '正在加载…' : '查看更多'}
            variant="quiet"
            size="sm"
            icon="forward"
            disabled={catalog.loading()}
            testID="home-catalog-more"
            onPress={() => catalog.loadMore()}
          />
        </View>
      </If>
      {/* TV has no sidebar, so the home page carries these entries there. */}
      <If when={tv()}>
        <View style={{ marginTop: 24 }}>
          <CardControls label="更多发现" onNavigate={props.store.noteFocusIntent} gap={tvUnit(20)}>
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
