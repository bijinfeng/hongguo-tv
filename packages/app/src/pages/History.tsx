import { List, Text, View } from 'nsh';
import { Button, Notice } from '@hongguo/ui';
import type { Store } from '../store';
export function History(props: { store: Store }) {
  const entries = () =>
    (props.store.library()?.entries ?? [])
      .filter((e) => e.last_played_at)
      .sort((a, b) => b.last_played_at! - a.last_played_at!);
  return (
    <View class="flex-1 gap-4 p-5 md:p-8">
      <Text class="text-2xl font-semibold text-foreground">继续观看</Text>
      <If when={props.store.library.error()}>
        <Notice
          error
          message={`记录加载失败：${String(props.store.library.error())}`}
          retry={props.store.library.refetch}
        />
      </If>
      <If when={!entries().length && !props.store.library.loading()}>
        <Notice message="看过的短剧会保存在这里。" />
      </If>
      <List
        each={entries()}
        keyExtractor={(entry) => entry.drama.series_id}
        estimatedItemSize={76}
        class="flex-1"
        contentStyle={{ gap: 12 }}
      >
        {(entry) => (
          <Button
            label={`${entry().drama.title} · 第 ${entry().episode ?? 1} 集 · ${Math.floor(entry().position ?? 0)} 秒`}
            onPress={() => props.store.open(entry().drama)}
          />
        )}
      </List>
    </View>
  );
}
