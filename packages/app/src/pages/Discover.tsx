import { Text, View, platform, type ViewRef } from 'nsh';
import {
  Button,
  CardControls,
  FilterChoices,
  Notice,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
} from '@hongguo/ui';
import { PosterPage } from './PosterPage';
import type { Store } from '../store';
import type { CategoryDimension } from '../category';
import { CalendarDays, ChartNoAxesColumnIncreasing, ChevronRight } from 'nsh-icon-lucide';

const dimensions: { key: CategoryDimension; label: string }[] = [
  { key: 'genre', label: '类型' },
  { key: 'category_dim_theme', label: '题材' },
  { key: 'sort', label: '排序' },
];

export function Discover(props: { store: Store }) {
  const category = props.store.category;
  let more: ViewRef | undefined;
  const moreSource = () =>
    props.store.categorySource(() => {
      if (category.data()?.has_more) more?.focus();
      else props.store.focusPrimary();
    });
  const terminalFocus = () => {
    if (props.store.activePage('discover') && !category.data()?.has_more && !category.error())
      props.store.focusPrimary();
  };
  const header = () => (
    <View style={{ gap: props.store.target === 'tv' ? 14 : 28 }}>
      <View class="flex-row items-center justify-between">
        {/* One destination, one name: the rail, the crumb and this heading all say 找剧. */}
        <UiText role="page">找剧</UiText>
      </View>
      <View class={props.store.target === 'tv' ? 'flex-row gap-4' : 'gap-3'}>
        <Each of={dimensions} key={(dimension) => dimension.key}>
          {(dimension) => (
            <FilterChoices
              variant={props.store.target === 'tv' ? 'select' : 'chips'}
              onSource={props.store.categorySource}
              onNavigate={props.store.noteFocusIntent}
              label={dimension().label}
              active={props.store.activePage('discover')}
              testID={`filter-${dimension().key}`}
              value={category.selection()[dimension().key]}
              items={category.choices(dimension().key)}
              onChange={(value) => {
                props.store.noteFocusIntent();
                category.change(dimension().key, value);
              }}
            />
          )}
        </Each>
        {/* Stated beside the filters that caused it, so the kept grid never shifts down a row.
            A live region announces the swap on TV and screen readers. */}
        <If when={category.stale()}>
          <Text
            class="text-muted-foreground"
            android={{ accessibilityLiveRegion: 'polite' }}
            style={{ fontSize: 14, alignSelf: 'center' }}
          >
            {category.error() ? '筛选未生效，仍是上一次的结果' : '正在套用新筛选…'}
          </Text>
        </If>
      </View>
      <If when={category.loading() && !category.data()}>
        {/* Same grid geometry as the results it stands in for, so the page does not reflow. */}
        <SkeletonRegion
          label="正在找剧"
          testID="category-pending"
          class="flex-row flex-wrap"
          style={{ gap: 12 }}
        >
          <Each of={[0, 1, 2, 3, 4, 5, 6, 7]}>
            {() => (
              <View
                accessibilityElementsHidden
                class="flex-1"
                style={{ minWidth: 150, maxWidth: '23%', gap: 10 }}
              >
                <SkeletonBlock width="100%" height={200} radius={10} />
                <SkeletonBlock width="70%" height={14} radius={4} />
                <SkeletonBlock width="40%" height={12} radius={4} />
              </View>
            )}
          </Each>
        </SkeletonRegion>
      </If>
      <If when={category.data() && !category.data()!.items.length && !category.loading()}>
        <View class="items-start gap-4">
          <UiText role="body">
            {category.data()?.has_more
              ? '本页暂无内容，可以继续浏览'
              : '没有找到相关短剧，试试其他筛选。'}
          </UiText>
          <If when={Object.values(category.selection()).some(Boolean)}>
            <Button
              testID="category-clear"
              variant="quiet"
              label="清除筛选"
              onPress={() => {
                props.store.noteFocusIntent();
                category.clear();
                props.store.focusPrimary();
              }}
            />
          </If>
        </View>
      </If>
      <If when={category.error()}>
        <Notice error message={category.error()} retry={category.retry} />
      </If>
    </View>
  );
  const footer = () => (
    <View style={{ gap: 12 }}>
      {/* Paging belongs to the page that owns the cursor: while a new filter is pending or has
          failed, this button would merge old-filter cards into the new answer. The trailing edge
          matches the home catalog's 查看更多: one load-more pattern on every page. */}
      <If when={category.data()?.has_more && !category.stale()}>
        <View class="items-end">
          <Button
            buttonRef={(ref) => {
              more = ref;
            }}
            onFocus={moreSource}
            testID="category-more"
            label={
              category.loading() ? '正在加载…' : category.error() ? '重试加载更多' : '加载更多'
            }
            displayLabel={category.loading() ? '正在加载…' : undefined}
            pending={category.loading()}
            variant="quiet"
            size="sm"
            icon={ChevronRight}
            disabled={category.loading()}
            onPress={() => {
              moreSource();
              category.loadMore();
            }}
            onFocusedRemoval={platform.os === 'macos' ? terminalFocus : undefined}
          />
        </View>
      </If>
      <If when={props.store.target === 'tv'}>
        <CardControls label="更多找剧方式" onNavigate={props.store.noteFocusIntent}>
          {/* The home rail carries the same entries as quiet; one semantic, one variant. */}
          <Button
            label="排行榜"
            icon={ChartNoAxesColumnIncreasing}
            variant="quiet"
            testID="discover-rankings"
            onPress={() => {
              props.store.navigate('rankings');
              props.store.restoreFocus();
            }}
          />
          <Button
            label="上新日历"
            icon={CalendarDays}
            variant="quiet"
            testID="discover-calendar"
            onPress={() => {
              props.store.navigate('calendar');
              props.store.restoreFocus();
            }}
          />
        </CardControls>
      </If>
    </View>
  );
  return (
    <PosterPage
      target={props.store.target}
      active={props.store.activePage('discover')}
      testID="category-results"
      collection={category.key()}
      label="分类短剧"
      items={category.data()?.items ?? []}
      selected={category.selected()}
      onNavigate={props.store.noteFocusIntent}
      onSource={props.store.categorySource}
      focusGuard={props.store.focusGuard}
      frame={{ top: 24, gap: 28 }}
      tvFrame={{ top: 16, gap: 14 }}
      caption={(drama) => (drama.episode_count ? `${drama.episode_count} 集` : undefined)}
      onOpen={(drama, restore) => {
        category.selected.set(drama.series_id);
        props.store.open(drama, restore);
      }}
      header={header}
      footer={footer}
    />
  );
}
