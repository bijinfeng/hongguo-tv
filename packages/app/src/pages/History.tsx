import { List, Text, View, effect, cleanup, type ListRef, type ViewRef } from 'nsh';
import { Button, Cover, Notice, Progress, ResultCard, tvUnit } from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import type { Store } from '../store';

type Entry = Library['entries'][number];
export const historyLabel = (entry: Entry) =>
  `${entry.drama.title} · 第 ${entry.episode ?? 1} 集 · ${Math.floor(entry.position ?? 0)} 秒`;
export function HistoryItem(props: {
  entry: Entry;
  store: Store;
  register?: (id: string, ref?: ViewRef) => void;
  restore?: (id: string) => void;
}) {
  let ref: ViewRef | undefined;
  effect(() => {
    const id = props.entry.drama.series_id;
    if (ref) props.register?.(id, ref);
    cleanup(() => props.register?.(id));
  });
  return (
    <ResultCard
      buttonRef={(node) => {
        ref = node;
        props.register?.(props.entry.drama.series_id, node);
      }}
      testID={`history-${props.entry.drama.series_id}`}
      label={historyLabel(props.entry)}
      selected={false}
      onPress={() => {
        const drama = props.entry.drama;
        props.store.open(drama, () => {
          if (props.restore) props.restore(drama.series_id);
          else ref?.focus();
        });
      }}
    >
      <View
        style={{
          width: props.store.target === 'tv' ? tvUnit(108) : 88,
          height: props.store.target === 'tv' ? tvUnit(152) : 112,
        }}
      >
        <Cover
          src={props.entry.drama.cover_fallback || props.entry.drama.cover}
          title={props.entry.drama.title}
          class="w-full h-full"
        />
      </View>
      <View class="flex-1 justify-center gap-2">
        <Text
          style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
          class={`${props.store.target === 'tv' ? 'text-xl' : 'text-base'} font-semibold text-foreground`}
        >
          {props.entry.drama.title}
        </Text>
        <Text
          style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          class="text-sm text-muted-foreground"
        >{`第 ${props.entry.episode ?? 1} 集 · 看到 ${Math.floor(props.entry.position ?? 0)} 秒`}</Text>
        <If when={props.entry.duration && props.entry.duration > 0}>
          <View class="max-w-[220px]">
            <Progress position={props.entry.position ?? 0} duration={props.entry.duration} />
          </View>
        </If>
        <If when={props.entry.completed}>
          <Text
            style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
            class="text-base text-muted-foreground"
          >
            本集已看完
          </Text>
        </If>
      </View>
    </ResultCard>
  );
}
export function LibraryStatus(props: { store: Store }) {
  return (
    <If
      when={
        props.store.library.loading() ||
        props.store.library.error() ||
        (!props.store.entries().length && props.store.library.state() === 'ready')
      }
    >
      <View class="gap-3">
        <If when={props.store.library.loading()}>
          <Text class="text-base text-muted-foreground">正在读取观看记录…</Text>
        </If>
        <If when={props.store.library.error()}>
          <Notice
            error
            message={`记录加载失败：${String(props.store.library.error())}`}
            retry={props.store.library.refetch}
          />
        </If>
        <If when={!props.store.entries().length && props.store.library.state() === 'ready'}>
          <Notice message="看过的短剧会保存在这里。" />
          <Button label="去找剧" primary onPress={() => props.store.navigate('search')} />
        </If>
      </View>
    </If>
  );
}
export function History(props: { store: Store }) {
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  const refs = new Map<string, ViewRef>();
  cleanup(() => cancelAnimationFrame(frame));
  const restore = () => {
    if (!anchor) return;
    const index = props.store.entries().findIndex((entry) => entry.drama.series_id === anchor!.id);
    if (index >= 0) list?.scrollToIndex({ index, viewOffset: -anchor.offset, animated: false });
  };
  effect(() => {
    if (props.store.activePage('history')) frame = requestAnimationFrame(restore);
  });
  return (
    <View
      class={`flex-1 gap-4 ${props.store.target === 'tv' ? '' : 'px-10 pt-7 pb-8'}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32) } : undefined}
    >
      <Text
        style={props.store.target === 'tv' ? { fontSize: tvUnit(44) } : { fontSize: 32 }}
        class={`${props.store.target === 'tv' ? 'text-4xl' : 'text-3xl'} font-semibold text-foreground`}
      >
        继续观看
      </Text>
      <LibraryStatus store={props.store} />
      <List
        ref={(ref) => {
          list = ref;
        }}
        onScroll={() => {
          if (!props.store.activePage('history')) return;
          void list?.measureScrollPosition().then((position) => {
            const entry = position && props.store.entries()[position.index];
            if (props.store.activePage('history') && entry && position)
              anchor = { id: entry.drama.series_id, offset: position.offset };
          });
        }}
        testID="history-list"
        each={props.store.entries()}
        keyExtractor={(entry) => entry.drama.series_id}
        estimatedItemSize={props.store.target === 'tv' ? tvUnit(202) : 154}
        class="flex-1"
        contentStyle={{ gap: props.store.target === 'tv' ? tvUnit(12) : 12 }}
      >
        {(entry) => (
          <HistoryItem
            entry={entry()}
            store={props.store}
            register={(id, ref) => {
              if (ref) refs.set(id, ref);
              else refs.delete(id);
            }}
            restore={(id) => {
              restore();
              frame = requestAnimationFrame(() => {
                const ref = refs.get(id);
                if (ref) ref.focus();
                else props.store.focusPrimary();
              });
            }}
          />
        )}
      </List>
    </View>
  );
}
