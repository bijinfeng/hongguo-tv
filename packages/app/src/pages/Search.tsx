import {
  Image,
  List,
  Text,
  View,
  signal,
  keymap,
  effect,
  cleanup,
  type InputRef,
  type ListRef,
  type ViewRef,
} from 'nsh';
import { Button, Notice, SearchInput, ResultCard } from '@hongguo/ui';
import { activePage, type Store } from '../store';

export function Search(props: { store: Store }) {
  const selected = signal(0);
  let input: InputRef | undefined;
  let list: ListRef | undefined;
  const submit = () => {
    selected.set(0);
    props.store.submit();
    input?.blur();
  };
  const refs = new Map<string, ViewRef>();
  let restoreFocus = false;
  const focusSelected = () => {
    const item = props.store.results()?.items[selected()];
    if (item) refs.get(item.series_id)?.focus();
  };
  const move = (delta: number) => {
    const size = props.store.results()?.items.length ?? 0;
    if (!size) return;
    selected.set(Math.max(0, Math.min(size - 1, selected() + delta)));
    restoreFocus = true;
    list?.scrollToIndex({ index: selected(), animated: false });
    focusSelected();
  };
  effect(() => {
    if (!activePage('search')) return;
    if (restoreFocus) focusSelected();
    cleanup(
      keymap.bind(
        { down: () => move(1), up: () => move(-1) },
        { when: 'notEditing', repeat: true },
      ),
    );
  });
  return (
    <View class="flex-1 gap-5 p-5 md:p-8">
      <View class="gap-2">
        <Text class="text-3xl font-semibold text-foreground">今天想看什么？</Text>
      </View>
      <View class="flex-row gap-3">
        <SearchInput
          inputRef={(ref) => {
            input = ref;
          }}
          value={props.store.draft()}
          onChange={props.store.draft.set}
          onSubmit={submit}
        />
        <Button label="搜索" primary disabled={!props.store.draft().trim()} onPress={submit} />
      </View>
      <If when={!props.store.query()}>
        <Notice message="输入剧名，找到下一部想追的短剧。" />
      </If>
      <If when={props.store.results.loading()}>
        <Text class="text-base text-muted-foreground">正在找剧…</Text>
      </If>
      <If when={props.store.results.error()}>
        <Notice
          error
          message={`搜索失败：${String(props.store.results.error())}`}
          retry={props.store.results.refetch}
        />
      </If>
      <If
        when={
          props.store.query() &&
          props.store.results.state() === 'ready' &&
          !props.store.results()?.items.length
        }
      >
        <Notice message="没有找到，试试其他关键词。" />
      </If>
      <List
        ref={(ref) => {
          list = ref;
        }}
        testID="results"
        each={props.store.results()?.items ?? []}
        keyExtractor={(drama) => drama.series_id}
        estimatedItemSize={164}
        class="flex-1"
        contentStyle={{ gap: 12 }}
      >
        {(drama, index) => {
          let ref: ViewRef | undefined;
          effect(() => {
            const id = drama().series_id;
            if (ref) refs.set(id, ref);
            cleanup(() => refs.delete(id));
            if (restoreFocus && activePage('search') && index() === selected()) ref?.focus();
          });
          return (
            <ResultCard
              buttonRef={(node) => {
                ref = node;
                refs.set(drama().series_id, node);
              }}
              testID={`drama-${drama().series_id}`}
              onPress={() => {
                selected.set(index());
                restoreFocus = true;
                props.store.open(drama());
              }}
              selected={index() === selected()}
            >
              <Image
                src={drama().cover_fallback || drama().cover}
                class="w-20 h-28 rounded-(--radius) bg-muted"
              />
              <View class="flex-1 justify-center gap-2">
                <Text class="text-xl font-semibold text-foreground">{drama().title}</Text>
                <Text class="text-sm text-muted-foreground">
                  {drama().episode_count ? `${drama().episode_count} 集` : '短剧'}
                </Text>
                <Text class="text-base text-muted-foreground line-clamp-2">
                  {drama().intro || '查看详情与选集'}
                </Text>
              </View>
            </ResultCard>
          );
        }}
      </List>
      <If when={props.store.results()?.has_more}>
        <Text class="text-sm text-muted-foreground">
          当前显示首批结果，可用更具体的关键词查找。
        </Text>
      </If>
    </View>
  );
}
