import { Text, View, platform, type ViewRef } from 'nsh';
import { Button, FilterChoices, Notice, tvUnit } from '@hongguo/ui';
import { PosterCollection } from '../PosterCollection';
import type { Store } from '../store';
import type { CategoryDimension } from '../category';

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
  return (
    <View
      class={`flex-1 gap-7 ${props.store.target === 'desktop' ? 'px-10 pt-7 pb-8' : ''}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32), gap: tvUnit(28) } : undefined}
    >
      <Text
        class="text-3xl font-semibold text-foreground"
        style={props.store.target === 'tv' ? { fontSize: tvUnit(38) } : undefined}
      >
        {props.store.target === 'tv' ? '找剧' : '找一部想看的'}
      </Text>
      <View class={props.store.target === 'tv' ? 'flex-row gap-4' : 'gap-3'}>
        <Each of={dimensions} key={(dimension) => dimension.key}>
          {(dimension) => (
            <FilterChoices
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
      </View>
      <If when={category.loading() && !category.data()}>
        <Text class="text-base text-muted-foreground">正在找剧…</Text>
      </If>
      <If when={category.data() && !category.data()!.items.length && !category.loading()}>
        <View class="items-start gap-4">
          <Text
            class="text-base text-muted-foreground"
            style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
          >
            {category.data()?.has_more
              ? '本页暂无内容，可以继续浏览'
              : '没有找到相关短剧，试试其他筛选。'}
          </Text>
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
        <Notice
          error
          message={category.error()}
          retry={!category.data() ? category.retry : undefined}
        />
      </If>
      <PosterCollection
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
        caption={(drama) => (drama.episode_count ? `${drama.episode_count} 集` : undefined)}
        onOpen={(drama, restore) => {
          category.selected.set(drama.series_id);
          props.store.open(drama, restore);
        }}
      />
      <If when={category.data()?.has_more}>
        <View class="items-start">
          <Button
            buttonRef={(ref) => {
              more = ref;
            }}
            onFocus={moreSource}
            testID="category-more"
            label={
              category.loading() ? '正在加载…' : category.error() ? '重试加载更多' : '加载更多'
            }
            disabled={category.loading()}
            onPress={() => {
              moreSource();
              category.loadMore();
            }}
            onFocusedRemoval={platform.os === 'macos' ? terminalFocus : undefined}
          />
        </View>
      </If>
    </View>
  );
}
