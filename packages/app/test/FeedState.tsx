import { Text, View, signal, cleanup } from 'nsh';
import { Button } from '@hongguo/ui';
import type { FeedResult } from '@hongguo/core-client';
import { createFeed } from '../src/feed';

/** Deliberately ignores abort, exercising ownership independently of the transport. */
export function FeedStateFixture() {
  const active = signal(false);
  const mounted = signal(true);
  const events = signal<string[]>([]);
  const log = (event: string) => events.update((all) => [...all, event]);
  const pending = new Map<
    number,
    { path: string; resolve: (v: unknown) => void; reject: () => void }
  >();
  let number = 0;
  let feed: ReturnType<typeof createFeed> | undefined;
  function Owner() {
    const owned = createFeed(async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined) throw new Error('Feed is read-only');
      const id = ++number;
      log(`read${id}:${path}`);
      abort?.addEventListener('abort', () => log(`abort${id}`));
      return new Promise<unknown>((resolve, reject) =>
        pending.set(id, { path, resolve, reject: () => reject(new Error('合成失败')) }),
      ) as Promise<T>;
    }, active);
    feed = owned;
    cleanup(() => {
      feed = undefined;
    });
    return (
      <View testID="feed-owner">
        <Text>{`current:${owned.current()?.series_id ?? 'none'}`}</Text>
        <Text>{`ids:${
          owned
            .state()
            .page?.items.map((i) => i.series_id)
            .join(',') ?? 'none'
        }`}</Text>
        <Text>{`channel:${owned.channel()}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.state().error ? 'feed-error' : 'no-error'}</Text>
      </View>
    );
  }
  const complete = (id: number, mode = 'normal') => {
    const task = pending.get(id);
    if (!task) return;
    const query = new URL(task.path, 'http://127.0.0.1').searchParams;
    const channel = query.get('channel') as FeedResult['channel'];
    task.resolve({
      channel,
      items:
        mode === 'empty' || mode === 'bad'
          ? []
          : (mode === 'many'
              ? Array.from({ length: 150 }, (_, i) => String(i + 1))
              : query.has('offset')
                ? ['1', '3', '3']
                : ['1', '2', '2']
            ).map((series_id) => ({ series_id, title: `作品${series_id}`, cover: '' })),
      has_more: mode !== 'terminal',
      next_offset:
        mode === 'bad'
          ? Number(query.get('offset') ?? 0)
          : !query.has('offset') && channel !== '16'
            ? 0
            : Number(query.get('offset') ?? 0) + 6,
      feed_cell: '123',
      feed_plan: '456',
      session_id: `session-${id}`,
      diagnostics: {},
    });
    pending.delete(id);
  };
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活" onPress={() => active.set(true)} />
        <Button label="隐藏" onPress={() => active.set(false)} />
        <Button label="推荐" onPress={() => feed?.select('16')} />
        <Button label="漫剧" onPress={() => feed?.select('36')} />
        <Button label="真人剧" onPress={() => feed?.select('39')} />
        <Button label="关注" onPress={() => feed?.select('45')} />
        <Button
          label="下一部"
          onPress={() => {
            feed?.next();
            feed?.next();
          }}
        />
        <Button label="单次下一部" onPress={() => feed?.next()} />
        <Button label="重试" onPress={() => feed?.retry()} />
        <Button label="完成" onPress={() => complete(number)} />
        <Button label="完成旧请求" onPress={() => complete(number - 1)} />
        <Button label="完成空页" onPress={() => complete(number, 'empty')} />
        <Button label="完成坏页" onPress={() => complete(number, 'bad')} />
        <Button label="完成末页" onPress={() => complete(number, 'terminal')} />
        <Button label="完成大量" onPress={() => complete(number, 'many')} />
        <Button label="失败" onPress={() => pending.get(number)?.reject()} />
        <Button label="移除" onPress={() => mounted.set(false)} />
      </View>
      <Text class="line-clamp-3">{events().join('|')}</Text>
      <If when={mounted()}>
        <Owner />
      </If>
    </View>
  );
}
