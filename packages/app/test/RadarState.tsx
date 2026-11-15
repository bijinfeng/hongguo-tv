import { Text, View, cleanup, signal } from 'nsh';
import { Button } from '@hongguo/ui';
import type { Drama, RadarSnapshot } from '@hongguo/core-client';
import { createRadar } from '../src/radar';

const snapshot = (partial = false, ties = false): RadarSnapshot => {
  const bucket = {
    rank_date: '2026-11-13',
    prev_rank_date: '2026-11-12',
    items: [
      { id: '101', title: '故事101', rank: 9, delta: 0, streak: 0 },
      { id: '102', title: '故事102', rank: null, delta: -2, streak: null },
      { id: '201', title: '故事201', rank: 3, delta: null, streak: null },
    ],
  };
  return {
    ranks: { hot: bucket, real: bucket, ai: bucket, comic: bucket },
    growth: partial
      ? null
      : {
          date: '2026-11-14',
          prev_date: '2026-11-12',
          gap: 2,
          items: [
            {
              id: '101',
              title: '故事101',
              type: 'real',
              hot: '9223372036854775807',
              d_hot: ties ? '7' : '9007199254740992',
              d_fav: '0',
              r_hot: 0,
              d7_hot: null,
            },
            {
              id: '102',
              title: '故事102',
              type: 'ai',
              hot: '0',
              d_hot: ties ? '7' : '9007199254740993',
              d_fav: '-20',
              r_hot: -0.03,
              d7_hot: '-1200',
            },
            {
              id: '201',
              title: '故事201',
              type: 'unknown',
              hot: null,
              d_hot: null,
              d_fav: null,
              r_hot: null,
              d7_hot: null,
            },
          ],
        },
    ranks_stale: false,
    growth_stale: partial,
    ranks_fetched_at: '2026-11-14T10:00:00Z',
    growth_fetched_at: partial ? null : '2026-11-14T10:05:00Z',
    cache_write_failed: false,
  };
};

/** Abort is deliberately ignored by deferred responses, so ownership must reject late writes. */
export function RadarStateFixture() {
  const active = signal(false);
  const mounted = signal(true);
  const events = signal<string[]>([]);
  const append = (value: string) => events.update((prior) => [...prior, value]);
  const pending = new Map<
    number,
    { path: string; resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let count = 0;
  let intent = 0;
  let radar: ReturnType<typeof createRadar> | undefined;
  const complete = (mode: 'normal' | 'partial' | 'wrong' | 'ties' = 'normal', task = count) => {
    const request = pending.get(task);
    if (!request) return;
    if (request.path.startsWith('/api/v1/radar'))
      request.resolve(snapshot(mode === 'partial', mode === 'ties'));
    else {
      const id = new URL(request.path, 'http://fixture').searchParams.get('series_id')!;
      request.resolve({
        series_id: mode === 'wrong' ? '999' : id,
        title: `真实详情${id}`,
        cover: '',
        intro: '',
        episodes: [],
      } satisfies Drama);
    }
    pending.delete(task);
  };
  const open = (id: string) => {
    const owned = ++intent;
    void radar?.open(
      id,
      () => owned === intent,
      (drama) => append(`opened:${drama.series_id}`),
    );
  };
  function Owner() {
    const owned = createRadar(async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined) throw new Error('Unexpected radar write');
      const task = ++count;
      append(`read${task}:${path}`);
      abort?.addEventListener('abort', () => append(`abort${task}`));
      return new Promise<unknown>((resolve, reject) =>
        pending.set(task, { path, resolve, reject }),
      ) as Promise<T>;
    }, active);
    radar = owned;
    cleanup(() => {
      radar = undefined;
    });
    return (
      <View>
        <Text>{`rows:${owned
          .rows()
          .map((row) => row.id)
          .join(',')}`}</Text>
        <Text>{`cells:${owned
          .rows()
          .map((row) => JSON.stringify(row.cells))
          .join('|')}`}</Text>
        <Text>{`growth-stale:${owned.data()?.growth_stale ?? false}`}</Text>
        <Text>{`dates:${owned.data()?.ranks?.hot.rank_date ?? ''}:${owned.data()?.growth?.date ?? ''}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{`pending:${owned.pending()}`}</Text>
        <Text>{owned.error()}</Text>
        <Text>{owned.detailError()?.message}</Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活雷达" onPress={() => active.set(true)} />
        <Button label="隐藏雷达" onPress={() => active.set(false)} />
        <Button label="完成当前" onPress={() => complete()} />
        <Button label="完成部分" onPress={() => complete('partial')} />
        <Button label="完成相等指标" onPress={() => complete('ties')} />
        <Button label="完成旧请求" onPress={() => complete('normal', 1)} />
        <Button label="完成旧详情" onPress={() => complete('normal', 2)} />
        <Button label="完成错误详情" onPress={() => complete('wrong')} />
        <Button
          label="失败当前"
          onPress={() => pending.get(count)?.reject(new Error('secret-token /private/service'))}
        />
        <Button label="刷新雷达" onPress={() => radar?.refresh()} />
        <Button label="增长视图" onPress={() => radar?.changeView('growth')} />
        <Button label="快照视图" onPress={() => radar?.changeView('snapshot')} />
        <Button label="按收藏增量" onPress={() => radar?.changeMetric('d_fav')} />
        <Button label="按增长率" onPress={() => radar?.changeMetric('r_hot')} />
        <Button label="未知类型" onPress={() => radar?.changeType('unknown')} />
        <Button label="打开101" onPress={() => open('101')} />
        <Button label="打开102" onPress={() => open('102')} />
        <Button label="打开未知ID" onPress={() => open('999')} />
        <Button
          label="较新意图"
          onPress={() => {
            intent++;
          }}
        />
        <Button label="卸载雷达" onPress={() => mounted.set(false)} />
      </View>
      <Text>{events().join('|')}</Text>
      <If when={mounted()}>
        <Owner />
      </If>
    </View>
  );
}
