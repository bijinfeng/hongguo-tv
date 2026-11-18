import { Text, View, cleanup, signal } from 'nsh';
import { Button, type ProductTarget } from '@hongguo/ui';
import { Rankings } from '../src/pages/Rankings';
import type { RankItem, RankOption, RankResult } from '@hongguo/core-client';
import { createRankings, rankingIdentity, type RankingDimension } from '../src/rankings';

const option = (id: string, label: string, selected = false): RankOption => ({
  id,
  label,
  selected,
  children: [],
  panels: [],
});
export const rankingOptions: RankOption[] = [
  {
    ...option('weekly & raw', '服务端榜名', true),
    children: [
      {
        ...option('sub-default', '默认子榜', true),
        panels: [
          {
            type: 'shared',
            label: '同ID面板组',
            options: [option('shared/B', '面板B')],
          },
        ],
      },
      { ...option('sub & 2', '第二子榜'), children: [option('deep', '更深子榜')] },
      option('shared/B', '直接子榜B'),
    ],
    panels: [
      {
        type: 'period',
        label: '时段',
        options: [option('', '服务端空值', true), option('panel/7', '七天')],
      },
      {
        type: 'nested',
        label: '外层组',
        options: [
          {
            ...option('outer/A', '外层选项', true),
            children: [option('unrelated-child', '旁支选项')],
            panels: [
              {
                type: 'inner',
                label: '内层组',
                options: [
                  {
                    ...option('inner/B', '内层选项', true),
                    panels: [
                      { type: 'deepest', label: '末层组', options: [option('deep/C', '末层选项')] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  option('', '空值榜'),
  option('actor-rank', '演员榜'),
];

function drama(id: string): RankItem {
  return {
    entry: { kind: 'drama', drama: { series_id: id, title: `作品${id}`, cover: '', intro: '' } },
    rank: 9,
  };
}
function actor(id: string): RankItem {
  return { entry: { kind: 'actor', actor: { id, name: `演员${id}` }, tags: [] }, heat: '真实热度' };
}

/** Transport deliberately ignores abort; only controller ownership can reject late writes. */
export function RankingsStateFixture() {
  const active = signal(false);
  const shown = signal(true);
  const layout = signal<ProductTarget | undefined>(undefined);
  const events = signal<string[]>([]);
  const log = (event: string) => events.update((all) => [...all, event]);
  const pending = new Map<number, { resolve: (value: RankResult) => void; reject: () => void }>();
  let number = 0;
  let rankings: ReturnType<typeof createRankings> | undefined;
  function Owner() {
    const owned = createRankings(async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined) throw new Error('Rankings must remain read-only');
      const id = ++number;
      log(`read${id}:${path}`);
      abort?.addEventListener('abort', () => log(`abort${id}`));
      return new Promise<RankResult>((resolve, reject) =>
        pending.set(id, {
          resolve,
          reject: () => reject(new Error('backend-secret-token /private/service/internal')),
        }),
      ) as Promise<T>;
    }, active);
    rankings = owned;
    cleanup(() => {
      rankings = undefined;
    });
    return (
      <View testID="rankings-owner">
        <Text class="line-clamp-2">{`ids:${owned.data()?.items.map(rankingIdentity).join(',') ?? 'none'}`}</Text>
        <Text class="line-clamp-2">{`selection:${owned.key()}`}</Text>
        <Text class="line-clamp-3">{`groups:${owned
          .groups()
          .map(
            (group) =>
              `${group.dimension}:${group.label}:${group.value ?? 'omitted'}:${group.options.map((item) => item.id).join(',')}`,
          )
          .join('|')}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.error() ? 'rankings-error' : 'no-error'}</Text>
        <Text>{owned.error()}</Text>
        <Text>{`cursor:${owned.data()?.next_offset ?? 'none'}`}</Text>
      </View>
    );
  }
  const complete = (
    id: number,
    mode: 'normal' | 'empty' | 'stalled' | 'many' | 'terminal' | 'hints' = 'normal',
  ) => {
    const hasMore = mode !== 'terminal';
    const response: RankResult = {
      items:
        mode === 'empty' || mode === 'stalled'
          ? []
          : mode === 'many'
            ? [...Array.from({ length: 150 }, (_, i) => drama(String(i + 1))), actor('150')]
            : [drama('1'), actor('1'), drama('1'), actor('1')],
      ranks:
        id === 1
          ? rankingOptions
          : mode === 'hints'
            ? rankingOptions
                .slice()
                .reverse()
                .map((item) => ({ ...item, selected: item.id === 'actor-rank' }))
            : [],
      has_more: hasMore,
      next_offset: mode === 'stalled' || mode === 'terminal' ? 0 : id * 20,
      session_id: `session-${id}`,
    };
    pending.get(id)?.resolve(response);
    pending.delete(id);
  };
  const choose = (dimension: RankingDimension, value: string) => {
    const group = rankings
      ?.groups()
      .find((row) => row.dimension === dimension && row.options.some((item) => item.id === value));
    if (group) rankings?.change(group.id, value);
  };
  return (
    <View class="flex-1 bg-background">
      <If when={!layout()}>
        <View class="flex-row flex-wrap">
          <Button compact label="密集桌面榜单" onPress={() => layout.set('desktop')} />
          <Button compact label="密集电视榜单" onPress={() => layout.set('tv')} />
          <Button compact label="激活榜单" onPress={() => active.set(true)} />
          <Button compact label="隐藏榜单" onPress={() => active.set(false)} />
          <Button compact label="完成榜单首屏" onPress={() => complete(1)} />
          <Button compact label="完成榜单当前" onPress={() => complete(number)} />
          <Button compact label="完成旧榜单续页" onPress={() => complete(2)} />
          <Button compact label="完成榜单空页" onPress={() => complete(number, 'empty')} />
          <Button compact label="完成榜单坏游标" onPress={() => complete(number, 'stalled')} />
          <Button compact label="完成榜单末页" onPress={() => complete(number, 'terminal')} />
          <Button compact label="完成大量榜单" onPress={() => complete(number, 'many')} />
          <Button compact label="完成相反默认" onPress={() => complete(number, 'hints')} />
          <Button compact label="失败榜单当前" onPress={() => pending.get(number)?.reject()} />
          <Button
            label="追加榜单"
            onPress={() => {
              rankings?.loadMore();
              rankings?.loadMore();
            }}
          />
          <Button compact label="重试榜单" onPress={() => rankings?.retry()} />
          <Button compact label="第二子榜" onPress={() => choose('rank_sub', 'sub & 2')} />
          <Button compact label="更深子榜" onPress={() => choose('rank_sub', 'deep')} />
          <Button compact label="跨维度子榜" onPress={() => choose('rank_sub', 'shared/B')} />
          <Button compact label="七天面板" onPress={() => choose('rank_panel', 'panel/7')} />
          <Button compact label="内层面板" onPress={() => choose('rank_panel', 'inner/B')} />
          <Button compact label="末层面板" onPress={() => choose('rank_panel', 'deep/C')} />
          <Button compact label="空值面板" onPress={() => choose('rank_panel', '')} />
          <Button compact label="选择空值榜" onPress={() => choose('rank', '')} />
          <Button compact label="选择演员榜" onPress={() => choose('rank', 'actor-rank')} />
          <Button compact label="选择无效榜" onPress={() => rankings?.change('rank', 'made-up')} />
          <Button compact label="移除榜单" onPress={() => shown.set(false)} />
        </View>
        <Text class="line-clamp-4">{events().join('|')}</Text>
        <If when={shown()}>
          <Owner />
        </If>
      </If>
      <If when={layout()}>{(target) => <RankingsLayoutFixture target={target()} />}</If>
    </View>
  );
}

/** Dense valid selectors exercise the production viewport without a second page implementation. */
function RankingsLayoutFixture(props: { target: ProductTarget }) {
  let child = option('sub-8', '子榜8', true);
  for (let depth = 7; depth >= 1; depth--)
    child = { ...option(`sub-${depth}`, `子榜${depth}`, true), children: [child] };
  const menus = [
    {
      ...option('dense', '密集榜单', true),
      children: [child],
      panels: Array.from({ length: 32 }, (_, index) => ({
        type: `group-${index}`,
        label: `具名筛选组${index}`,
        options: [option(`choice-${index}`, `筛选值${index}`, true)],
      })),
    },
  ];
  const opened = signal('');
  const queries = signal('');
  let continuation = 0;
  const rankings = createRankings(
    async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined || abort?.aborted) throw new Error('Invalid fixture read');
      queries.set(path);
      const more = new URL(path, 'http://127.0.0.1').searchParams.has('offset');
      if (more && ++continuation === 1) throw new Error('密集菜单续页失败');
      return {
        items: [drama(more ? '2' : '1')],
        ranks: menus,
        has_more: !more,
        next_offset: more ? 0 : 20,
        session_id: 'dense-session',
      } as T;
    },
    () => true,
  );
  return (
    <>
      <View class="flex-1 bg-background">
        <Rankings
          rankings={rankings}
          target={props.target}
          active
          onOpen={(item) => opened.set(`opened:drama:${item.series_id}`)}
          onActor={(id) => opened.set(`opened:actor:${id}`)}
          onSource={() => {}}
          onNavigate={() => {}}
          focusGuard={() => () => true}
          onPrimary={() => {}}
        />
        <Text class="line-clamp-1">{opened()}</Text>
        <Text class="line-clamp-1">{queries()}</Text>
      </View>
    </>
  );
}
