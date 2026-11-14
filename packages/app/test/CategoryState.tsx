import { signal, Text, View, cleanup } from 'nsh';
import { Button } from '@hongguo/ui';
import { createCategory } from '../src/category';
import type { CategoryResult } from '@hongguo/core-client';

export const categoryRows = [
  {
    type: 'genre',
    label: '体裁',
    options: [
      { id: 'short_play', label: '短剧' },
      { id: 'comic_series', label: '漫剧' },
    ],
  },
  {
    type: 'category_dim_theme',
    label: '主题',
    options: [
      { id: 'cate_165', label: '悬疑' },
      { id: 'cate_2', label: '都市' },
    ],
  },
  {
    type: 'sort',
    label: '推荐',
    options: [
      { id: 'hot_collect', label: '最高收藏' },
      { id: 'hot_score', label: '最热门' },
      { id: 'online_time', label: '最新' },
    ],
  },
];

/** Ignores abort deliberately: late-result ownership is independent of transport cooperation. */
export function CategoryStateFixture() {
  const active = signal(false);
  const shown = signal(true);
  const events = signal<string[]>([]);
  const log = (event: string) => events.update((all) => [...all, event]);
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: () => void }>();
  let number = 0;
  let category: ReturnType<typeof createCategory> | undefined;
  function Owner() {
    const owned = createCategory(async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined) throw new Error('Category must be read-only');
      const id = ++number;
      log(`read${id}:${path}`);
      abort?.addEventListener('abort', () => log(`abort${id}`));
      return new Promise<unknown>((resolve, reject) =>
        pending.set(id, {
          resolve,
          reject: () => reject(new Error('合成失败')),
        }),
      ) as Promise<T>;
    }, active);
    category = owned;
    cleanup(() => {
      category = undefined;
    });
    return (
      <View testID="category-owner">
        <Text class="line-clamp-2">{`ids:${
          owned
            .data()
            ?.items.map((item) => item.series_id)
            .join(',') ?? 'none'
        }`}</Text>
        <Text>{`choices:${owned
          .choices('sort')
          .map((item) => item.value || 'all')
          .join(',')}`}</Text>
        <Text>{`themes:${owned
          .choices('category_dim_theme')
          .map((item) => item.value || 'all')
          .join(',')}`}</Text>
        <Text>{`selection:${owned.key()}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.error() ? 'category-error' : 'no-error'}</Text>
      </View>
    );
  }
  const complete = (id: number, empty = false, stalled = false, many = false) => {
    const response: CategoryResult = {
      items: empty
        ? []
        : (many ? Array.from({ length: 150 }, (_, i) => i + 1) : [1, 2, 2]).map((i) => ({
            series_id: String(i),
            title: `作品${i}`,
            cover: '',
            intro: '',
          })),
      has_more: true,
      next_offset: stalled ? 0 : id * 15,
      session_id: `session-${id}`,
      ...(id === 1
        ? { filters: categoryRows }
        : id === 3
          ? {
              filters: categoryRows.map((row) =>
                row.type === 'category_dim_theme'
                  ? { ...row, options: row.options.slice(0, 1) }
                  : row,
              ),
            }
          : {}),
    };
    pending.get(id)?.resolve(response);
    pending.delete(id);
  };
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活分类" onPress={() => active.set(true)} />
        <Button label="隐藏分类" onPress={() => active.set(false)} />
        <Button label="完成首屏" onPress={() => complete(1)} />
        <Button label="完成大量首屏" onPress={() => complete(number, false, false, true)} />
        <Button label="完成当前" onPress={() => complete(number)} />
        <Button label="完成旧续页" onPress={() => complete(2)} />
        <Button label="完成空页" onPress={() => complete(number, true)} />
        <Button label="完成坏游标" onPress={() => complete(number, true, true)} />
        <Button label="失败当前" onPress={() => pending.get(number)?.reject()} />
        <Button
          label="追加分类"
          onPress={() => {
            category?.loadMore();
            category?.loadMore();
          }}
        />
        <Button label="清除筛选" onPress={() => category?.clear()} />
        <Button label="重试分类" onPress={() => category?.retry()} />
        <Button
          label="悬疑筛选"
          onPress={() => category?.change('category_dim_theme', 'cate_165')}
        />
        <Button label="漫剧筛选" onPress={() => category?.change('genre', 'comic_series')} />
        <Button label="移除分类" onPress={() => shown.set(false)} />
      </View>
      <Text class="line-clamp-3">{events().join('|')}</Text>
      <If when={shown()}>
        <Owner />
      </If>
    </View>
  );
}
