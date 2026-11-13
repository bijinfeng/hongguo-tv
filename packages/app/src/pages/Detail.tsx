import { Image, List, resource, Text, View } from 'nsh';
import { detail, type Drama } from '@hongguo/core-client';
import { nav, type Store } from '../store';
import { Button, Notice, Surface } from '@hongguo/ui';

export function Detail(props: { drama: Drama; store: Store }) {
  const result = resource(
    () => props.drama,
    (drama, { signal }) => detail(drama, signal),
  );
  const resume = () => props.store.resume(props.drama);
  const episodes = () => result()?.episodes ?? [];
  const start = () => {
    const ep =
      episodes().find((e) => e.video_id === resume()?.video_id) ??
      episodes().find((e) => !e.locked);
    if (ep && result()) nav.push({ name: 'player', drama: result()!, episode: ep });
  };
  return (
    <View class="flex-1 gap-5 p-5 md:p-8">
      <Surface>
        <View class="flex-row gap-5">
          <Image
            src={props.drama.cover_fallback || props.drama.cover}
            class="w-24 h-36 rounded-(--radius) bg-muted"
          />
          <View class="flex-1 gap-3">
            <Text class="text-2xl font-semibold text-foreground">{props.drama.title}</Text>
            <Text class="text-base text-muted-foreground line-clamp-4">
              {result()?.intro || props.drama.intro || '暂无简介'}
            </Text>
            <Button
              label={resume()?.video_id ? `继续第 ${resume()?.episode} 集` : '开始观看'}
              primary
              disabled={!episodes().some((e) => !e.locked)}
              onPress={start}
            />
          </View>
        </View>
      </Surface>
      <If when={result.loading()}>
        <Text class="text-base text-muted-foreground">正在加载选集…</Text>
      </If>
      <If when={result.error()}>
        <Notice error message={`详情加载失败：${String(result.error())}`} retry={result.refetch} />
      </If>
      <Text class="text-lg font-semibold text-foreground">选集</Text>
      <List
        each={episodes()}
        keyExtractor={(e) => e.video_id}
        estimatedItemSize={64}
        numColumns={4}
        class="flex-1"
        contentStyle={{ gap: 12 }}
      >
        {(episode) => (
          <Button
            label={`第 ${episode().index} 集${episode().locked ? ' · 未开放' : ''}`}
            disabled={episode().locked}
            selected={episode().video_id === resume()?.video_id}
            onPress={() => nav.push({ name: 'player', drama: result()!, episode: episode() })}
          />
        )}
      </List>
    </View>
  );
}
