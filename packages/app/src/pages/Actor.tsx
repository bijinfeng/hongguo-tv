import { Image, Text, View, resource, signal, effect, lifecycle } from 'nsh';
import { Notice, tvUnit } from '@hongguo/ui';
import { captureRequest, type ActorWorksResult } from '@hongguo/core-client';
import type { Store } from '../store';
import { PosterCollection } from '../PosterCollection';

export function Actor(props: { store: Store; actorId: string; title: string; active: boolean }) {
  const request = captureRequest();
  const snapshot = signal<ActorWorksResult | undefined>(undefined);
  const selected = signal('');
  const result = resource(
    () => (props.active && lifecycle() === 'active' && !snapshot() ? props.actorId : undefined),
    (id, { signal }) =>
      request<ActorWorksResult>(`/api/v1/actors/works?actor_id=${encodeURIComponent(id)}`, signal),
  );
  effect(() => {
    const data = result();
    if (data) snapshot.set(data);
  });
  const data = () => snapshot() ?? result();
  return (
    <View
      testID="actor-works"
      class={`flex-1 gap-7 ${props.store.target === 'desktop' ? 'px-10 pt-3 pb-8' : ''}`}
      style={props.store.target === 'tv' ? { gap: tvUnit(28), paddingTop: tvUnit(12) } : undefined}
    >
      <View class="flex-row items-center gap-5">
        <If when={data()?.actor.avatar}>
          <Image
            src={data()!.actor.avatar!}
            class="rounded-full"
            accessibilityLabel={data()?.actor.name || props.title}
            style={{
              width: props.store.target === 'tv' ? tvUnit(96) : 72,
              height: props.store.target === 'tv' ? tvUnit(96) : 72,
            }}
          />
        </If>
        <View class="flex-1 gap-2">
          <Text
            role="header"
            accessibilityLevel={1}
            class="text-3xl font-semibold text-foreground"
            style={props.store.target === 'tv' ? { fontSize: tvUnit(36) } : undefined}
          >
            {data()?.actor.name || props.title}
          </Text>
          <If when={data()?.actor.description}>
            <Text
              class="line-clamp-3 text-base text-muted-foreground"
              style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
            >
              {data()!.actor.description}
            </Text>
          </If>
        </View>
      </View>
      <If when={result.loading() && !data()}>
        <Text class="text-base text-muted-foreground">正在加载作品…</Text>
      </If>
      <If when={result.error()}>
        <Notice error message="作品未能加载" retry={result.refetch} />
      </If>
      <If when={data() && !data()!.items.length}>
        <Notice message="暂时没有可展示的作品" />
      </If>
      <PosterCollection
        onNavigate={props.store.noteFocusIntent}
        focusGuard={props.store.focusGuard}
        target={props.store.target}
        active={props.active}
        items={data()?.items ?? []}
        collection={props.actorId}
        testID="actor-results"
        label="演员作品"
        selected={selected()}
        caption={(drama) => (drama.episode_count ? `${drama.episode_count} 集` : undefined)}
        onOpen={(drama, restore) => {
          selected.set(drama.series_id);
          props.store.open(drama, restore);
        }}
      />
    </View>
  );
}
