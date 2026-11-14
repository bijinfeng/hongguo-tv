import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import type { Drama, SeriesSeason } from '@hongguo/core-client';
import { createSeasons } from '../src/seasons';
import { createSeasonDetail } from '../src/season-detail';

const episodes = (id: string) => [
  { index: 1, video_id: `${id}1`, locked: false },
  { index: 2, video_id: `${id}2`, locked: false },
];
const drama = (id: string, type = '1'): Drama => ({
  series_id: id,
  content_type: type,
  title: `作品${id}`,
  cover: '',
  intro: '',
  episode_count: 2,
});
const season = (id: string, type = '1'): SeriesSeason => ({
  drama: drama(id, type),
  playable: id !== '300' && id !== '400',
  upcoming: id === '300',
  ...(id !== '300' && id !== '400' ? { first_video_id: `${id}1` } : {}),
});

/** Deferred reads ignore abort deliberately; no playback or persistence adapter is installed. */
export function SeasonDetailFixture() {
  const active = signal(false);
  const mounted = signal(true);
  const source = signal(drama('100'));
  const events = signal<string[]>([]);
  const log = (event: string) => events.update((all) => [...all, event]);
  let count = 0;
  const tasks = new Map<
    number,
    { id: string; type: string; resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let select: ((id: string) => boolean) | undefined;
  let retry: (() => void) | undefined;
  function Owner() {
    const request = async <T,>(path: string, abort?: AbortSignal, body?: unknown): Promise<T> => {
      if (body !== undefined) throw new Error('Unexpected write');
      const url = new URL(path, 'http://127.0.0.1');
      const id = url.searchParams.get('series_id') ?? '';
      const type = url.searchParams.get('content_type') ?? '';
      if (url.pathname === '/api/v1/series/seasons')
        return {
          items:
            id === '100'
              ? [season('200'), season('100', source().content_type), season('300'), season('400')]
              : [],
        } as T;
      if (url.pathname !== '/api/v1/series/detail') throw new Error('Unexpected side-effect read');
      const requestId = ++count;
      log(`read${requestId}:${id}:${type}`);
      abort?.addEventListener('abort', () => log(`abort${requestId}`));
      return new Promise<unknown>((resolve, reject) => {
        tasks.set(requestId, { id, type, resolve, reject });
      }) as Promise<T>;
    };
    const seasons = createSeasons(request, source, active);
    const browse = createSeasonDetail(request, seasons, active);
    select = seasons.select;
    retry = browse.retry;
    cleanup(() => {
      select = undefined;
      retry = undefined;
    });
    return (
      <View testID="season-detail-owner">
        <Text>{`selected:${seasons.selectedId()}`}</Text>
        <Text>{`availability:${seasons.availability()}`}</Text>
        <Text>{`detail:${browse.drama()?.series_id ?? 'none'}:${browse.drama()?.content_type ?? 'none'}`}</Text>
        <Text>{`summary:${browse.summary()?.series_id ?? 'none'}`}</Text>
        <Text>{`summary-title:${browse.summary()?.title ?? 'none'}`}</Text>
        <Text>{`episodes:${
          browse
            .drama()
            ?.episodes?.map((item) => item.video_id)
            .join(',') ?? 'none'
        }`}</Text>
        <Text>{`loading:${browse.loading()}`}</Text>
        <Text>{`error:${browse.error()}`}</Text>
      </View>
    );
  }
  const complete = (requestId: number, mode = 'valid') => {
    const task = tasks.get(requestId);
    if (!task) return;
    if (mode === 'sensitive') {
      task.reject(new Error('https://internal.fixture/private?token=never-expose'));
    } else {
      const detail = {
        ...drama(mode === 'identity' ? '999' : task.id, mode === 'type' ? '999' : task.type),
        episodes: episodes(task.id),
      };
      task.resolve(
        mode === 'duplicate'
          ? { ...detail, episodes: [detail.episodes[0], detail.episodes[0]] }
          : mode === 'missing-type'
            ? { ...detail, content_type: undefined }
            : mode === 'malformed'
              ? { ...detail, episodes: [{ ...detail.episodes[0], index: 0 }] }
              : mode === 'sparse'
                ? { ...detail, title: '', cover: '', intro: '' }
                : detail,
      );
    }
    tasks.delete(requestId);
  };
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活浏览" onPress={() => active.set(true)} />
        <Button label="隐藏浏览" onPress={() => active.set(false)} />
        <Button label="浏览原季" onPress={() => select?.('100')} />
        <Button label="浏览第二季" onPress={() => select?.('200')} />
        <Button label="浏览预告季" onPress={() => select?.('300')} />
        <Button label="浏览不可播季" onPress={() => select?.('400')} />
        <Button label="切换来源" onPress={() => source.set(drama('900'))} />
        <Button label="返回原来源" onPress={() => source.set(drama('100'))} />
        <Button label="更换内容类型" onPress={() => source.set(drama('100', '2'))} />
        <Button
          label="使用已有详情"
          onPress={() => source.set({ ...drama('900'), episodes: episodes('900') })}
        />
        <Button label="重试详情" onPress={() => retry?.()} />
        <Button label="完成当前详情" onPress={() => complete(count)} />
        <Button label="完成旧详情" onPress={() => complete(1)} />
        <Button label="错误详情身份" onPress={() => complete(count, 'identity')} />
        <Button label="错误内容类型" onPress={() => complete(count, 'type')} />
        <Button label="重复选集" onPress={() => complete(count, 'duplicate')} />
        <Button label="非法选集" onPress={() => complete(count, 'malformed')} />
        <Button label="省略内容类型" onPress={() => complete(count, 'missing-type')} />
        <Button label="返回空元数据" onPress={() => complete(count, 'sparse')} />
        <Button label="敏感详情错误" onPress={() => complete(count, 'sensitive')} />
        <Button label="移除浏览" onPress={() => mounted.set(false)} />
      </View>
      <Text class="line-clamp-6">{events().join('|')}</Text>
      <If when={mounted()}>
        <Owner />
      </If>
    </View>
  );
}
