import { View, windowSize } from 'nsh';
import { Button, CardControls, PosterCard, UiText, tvUnit } from '@hongguo/ui';
import type { Store } from '../../store';

/** Draft poster grid: 6 columns on wide desktop, 4 below 1600, 4 on TV. */
function columns(store: Store) {
  if (store.target === 'tv') return 4;
  return windowSize().width >= 1600 ? 6 : 4;
}

function gutter() {
  return Math.min(64, Math.max(24, windowSize().width * 0.035));
}

function cardWidth(store: Store) {
  if (store.target === 'tv') return 326;
  const count = columns(store);
  const usable = Math.min(1660, windowSize().width) - 176 - gutter() * 2;
  return Math.max(150, Math.floor((usable - (count - 1) * 25) / count));
}

/** Filter chips own the query; the draft keeps them in one row above the grid. */
function CatalogFilters(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const catalog = props.store.homeCatalog;
  const themes = () => catalog.choices('category_dim_theme');
  const sorts = () => catalog.choices('sort');
  return (
    <View class="flex-row flex-wrap items-center" style={{ gap: 16, marginBottom: 22 }}>
      <CardControls label="题材" onNavigate={props.store.noteFocusIntent} gap={7} class="flex-wrap">
        <Each of={themes()} key={(choice) => `theme-${choice.value}`}>
          {(choice) => (
            <Button
              label={choice().title}
              size="sm"
              variant="quiet"
              selected={catalog.selection().category_dim_theme === choice().value}
              testID={`home-filter-theme-${choice().value || 'all'}`}
              onPress={() => catalog.change('category_dim_theme', choice().value)}
            />
          )}
        </Each>
      </CardControls>
      <View class="flex-row items-center" style={{ gap: 7, marginLeft: 'auto' }}>
        <UiText role="meta">排序</UiText>
        <CardControls label="排序" onNavigate={props.store.noteFocusIntent} gap={7}>
          <Each of={sorts()} key={(choice) => `sort-${choice.value}`}>
            {(choice) => (
              <Button
                label={choice().title}
                size="sm"
                variant="quiet"
                selected={catalog.selection().sort === choice().value}
                testID={`home-filter-sort-${choice().value || 'all'}`}
                onPress={() => catalog.change('sort', choice().value)}
              />
            )}
          </Each>
        </CardControls>
      </View>
      <If when={tv()}>
        <UiText role="meta">{`${catalog.data()?.items.length ?? 0} 部剧`}</UiText>
      </If>
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
      <View class="flex-row flex-wrap" style={{ gap: 20 }}>
        <Each of={[0, 1, 2, 3]} key={(index: number) => `skeleton-${index}`}>
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
        <UiText role="section">今晚，想看什么</UiText>
        <If when={!tv() && items().length > 0}>
          <UiText role="meta">{`${items().length} 部剧`}</UiText>
        </If>
      </View>
      <If when={!tv()}>
        <CatalogFilters store={props.store} />
      </If>
      <If when={items().length > 0} else={<CatalogPlaceholder store={props.store} />}>
        <View class="flex-row flex-wrap" style={{ gap: 20 }}>
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
        <View class="items-start" style={{ marginTop: 28 }}>
          <Button
            label={catalog.loading() ? '正在加载…' : '查看更多'}
            variant="quiet"
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
