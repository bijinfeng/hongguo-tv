import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import type { Drama, SeriesSeason } from '@hongguo/core-client';
import { createSeasons } from '../src/seasons';

const episodes = (id: string) => [
  { index: 1, video_id: `${id}1`, locked: false },
  { index: 2, video_id: `${id}2`, locked: false },
];
const drama = (id: string): Drama => ({
  series_id: id,
  title: `作品${id}`,
  cover: '',
  intro: '',
  episode_count: 2,
});
const season = (
  id: string,
  index: number | undefined,
  upcoming = false,
  playable = !upcoming,
): SeriesSeason => ({
  drama: drama(id),
  season_index: index,
  label: `第${index}季`,
  upcoming,
  playable,
  ...(playable ? { first_video_id: `${id}1` } : {}),
  ...(upcoming ? { reservation_id: id } : {}),
});
const list = (mode = 'valid') => ({
  items: [
    season('200', 2),
    season('100', mode === 'valid' ? undefined : 1),
    season('300', 3, true),
    season('400', 4, false, false),
  ]
    .filter((row) => mode !== 'gap' || row.drama.series_id !== '200')
    .filter((row) => mode !== 'last' || row.drama.series_id === '100')
    .map((row) =>
      row.drama.series_id === '200' && ['upcoming', 'unavailable'].includes(mode)
        ? season('200', 2, mode === 'upcoming', false)
        : row,
    )
    .concat(
      mode === 'duplicate-next'
        ? [season('250', 2)]
        : mode === 'duplicate-current'
          ? [season('150', 1)]
          : [],
    ),
});

/** Read-only deferred transport deliberately ignores abort to expose stale-write bugs. */
export function SeasonsStateFixture() {
  const active = signal(false);
  const mounted = signal(true);
  const source = signal<Drama | undefined>(drama('100'));
  const events = signal<string[]>([]);
  const log = (event: string) => events.update((all) => [...all, event]);
  const pending = new Map<
    number,
    { path: string; resolve: (value: unknown) => void; reject: (error?: Error) => void }
  >();
  let count = 0;
  let context: ReturnType<typeof createSeasons> | undefined;
  function Owner() {
    const owned = createSeasons(
      async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
        if (body !== undefined || !/^\/api\/v1\/series\/(seasons|next-season|detail)\?/.test(path))
          throw new Error('Unexpected side-effect request');
        const id = ++count;
        log(`read${id}:${path}`);
        abort?.addEventListener('abort', () => log(`abort${id}`));
        return new Promise<unknown>((resolve, reject) =>
          pending.set(id, {
            path,
            resolve,
            reject: (error = new Error('合成失败')) => reject(error),
          }),
        ) as Promise<T>;
      },
      source,
      active,
    );
    context = owned;
    cleanup(() => {
      context = undefined;
    });
    return (
      <View testID="seasons-owner">
        <Text>{`source:${owned.source()?.series_id ?? 'none'}`}</Text>
        <Text>{`source-type:${owned.source()?.content_type ?? 'none'}`}</Text>
        <Text>{`selected:${owned.selectedId()}`}</Text>
        <Text>{`drama:${owned.selectedDrama()?.series_id ?? 'none'}`}</Text>
        <Text>{`drama-type:${owned.selectedDrama()?.content_type ?? 'none'}`}</Text>
        <Text>{`availability:${owned.availability()}`}</Text>
        <Text>{`ids:${owned
          .items()
          .map((row) => row.drama.series_id)
          .join(',')}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.error() ? 'seasons-error' : 'seasons-ok'}</Text>
        <Text>{`seasons-message:${owned.error()}`}</Text>
        <Text>{`next-loading:${owned.nextLoading()}`}</Text>
        <Text>{owned.nextError() ? 'next-error' : 'next-ok'}</Text>
        <Text>{`next-message:${owned.nextError()}`}</Text>
        <Text>{`next-status:${owned.nextStatus()}`}</Text>
        <Text>{`next:${owned.nextResult()?.drama.series_id ?? 'none'}:${owned.nextResult()?.episode.video_id ?? 'none'}`}</Text>
      </View>
    );
  }
  const complete = (id: number, mode = 'valid') => {
    const task = pending.get(id);
    if (!task) return;
    const path = new URL(task.path, 'http://127.0.0.1').pathname;
    if (path.endsWith('/seasons'))
      task.resolve(mode === 'invalid' ? { items: [season('300', 3, true, true)] } : list(mode));
    else if (path.endsWith('/next-season'))
      task.resolve({
        current_season: 1,
        next:
          mode === 'none' ? null : mode === 'upcoming' ? season('300', 3, true) : season('200', 2),
      });
    else
      task.resolve({
        ...drama(mode === 'identity' ? '900' : '200'),
        ...(mode === 'type' ? { content_type: 'wrong' } : {}),
        episodes:
          mode === 'video'
            ? episodes('900')
            : episodes('200').map((item) => ({
                ...item,
                locked: mode === 'locked' || item.locked,
              })),
      });
    pending.delete(id);
  };
  const resolveNext = () => {
    const current = { ...drama('100'), episodes: episodes('100') };
    void context
      ?.next(current, current.episodes[1])
      .then((result) => log(`returned:${result?.drama.series_id ?? 'none'}`));
  };
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活系列" onPress={() => active.set(true)} />
        <Button label="隐藏系列" onPress={() => active.set(false)} />
        <Button
          label="切换来源类型"
          onPress={() => source.set({ ...drama('100'), content_type: 'drama' })}
        />
        <Button label="切换来源" onPress={() => source.set(drama('900'))} />
        <Button label="选择第二季" onPress={() => context?.select('200')} />
        <Button label="选择预告季" onPress={() => context?.select('300')} />
        <Button label="选择不可播季" onPress={() => context?.select('400')} />
        <Button label="选择原季" onPress={() => context?.select('100')} />
        <Button label="选择未知季" onPress={() => context?.select('999')} />
        <Button label="重试系列" onPress={() => context?.retry()} />
        <Button label="解析下一季" onPress={resolveNext} />
        <Button
          label="重试下一季"
          onPress={() => {
            void context?.retryNext();
          }}
        />
        <Button label="取消下一季" onPress={() => context?.cancelNext()} />
        <Button label="完成当前" onPress={() => complete(count)} />
        <Button label="完成旧首屏" onPress={() => complete(1)} />
        <Button label="完成旧关系" onPress={() => complete(2)} />
        <Button label="完成旧详情" onPress={() => complete(3)} />
        <Each
          of={[
            'known',
            'upcoming',
            'unavailable',
            'gap',
            'duplicate-next',
            'duplicate-current',
            'last',
          ]}
        >
          {(mode) => <Button label={`系列:${mode()}`} onPress={() => complete(count, mode())} />}
        </Each>
        <Button label="错误类型" onPress={() => complete(count, 'type')} />
        <Button label="无下一季" onPress={() => complete(count, 'none')} />
        <Button label="坏系列数据" onPress={() => complete(count, 'invalid')} />
        <Button label="预告关系" onPress={() => complete(count, 'upcoming')} />
        <Button label="错误身份" onPress={() => complete(count, 'identity')} />
        <Button label="错误首集" onPress={() => complete(count, 'video')} />
        <Button label="锁定首集" onPress={() => complete(count, 'locked')} />
        <Button
          label="失败当前"
          onPress={() => {
            pending.get(count)?.reject();
            pending.delete(count);
          }}
        />
        <Button
          label="敏感错误当前"
          onPress={() => {
            pending
              .get(count)
              ?.reject(new Error('https://internal.fixture/private?token=never-expose'));
            pending.delete(count);
          }}
        />
        <Button
          label="超时错误当前"
          onPress={() => {
            pending.get(count)?.reject(
              Object.assign(new Error('https://internal.fixture/timeout?token=never-expose'), {
                code: 'UPSTREAM_TIMEOUT',
              }),
            );
            pending.delete(count);
          }}
        />
        <Button label="移除系列" onPress={() => mounted.set(false)} />
      </View>
      <Text class="line-clamp-6">{events().join('|')}</Text>
      <If when={mounted()}>
        <Owner />
      </If>
    </View>
  );
}
