import { Image, Text, View, resource, signal, effect, lifecycle, type ViewRef } from 'nsh';
import { BackButton, Notice, UiText, space } from '@hongguo/ui';
import { captureRequest, type ActorWorksResult } from '@hongguo/core-client';
import type { Store } from '../store';
import { PosterPage } from './PosterPage';

export function Actor(props: { store: Store; actorId: string; title: string; active: boolean }) {
  const request = captureRequest();
  const snapshot = signal<ActorWorksResult | undefined>(undefined);
  const selected = signal('');
  let back: ViewRef | undefined;
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
  const header = () => (
    <View style={{ gap: props.store.target === 'tv' ? 14 : 28 }}>
      <BackButton
        buttonRef={(ref) => {
          back = ref;
        }}
        testID="actor-back"
        label={props.store.backLabel()}
        onPress={() => props.store.back()}
      />
      <View class="flex-row items-center gap-5">
        <If when={data()?.actor.avatar}>
          <Image
            src={data()!.actor.avatar!}
            class="rounded-full"
            accessibilityLabel={data()?.actor.name || props.title}
            style={{
              width: props.store.target === 'tv' ? 48 : 72,
              height: props.store.target === 'tv' ? 48 : 72,
            }}
          />
        </If>
        <View class="flex-1 gap-2">
          <UiText role="page" lines={2}>
            {data()?.actor.name || props.title}
          </UiText>
          <If when={data()?.actor.description}>
            <UiText role="body" tone="muted" lines={3}>
              {data()!.actor.description}
            </UiText>
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
    </View>
  );
  return (
    <PosterPage
      target={props.store.target}
      onEmptyFocus={() => back?.focus()}
      active={props.active}
      testID="actor-results"
      pageTestID="actor-works"
      collection={props.actorId}
      label="演员作品"
      items={data()?.items ?? []}
      selected={selected()}
      onNavigate={props.store.noteFocusIntent}
      focusGuard={props.store.focusGuard}
      frame={{ top: space('md'), gap: space('xl') }}
      tvFrame={{ top: space('xxs'), gap: space('md') }}
      caption={(drama) => (drama.episode_count ? `${drama.episode_count} 集` : undefined)}
      onOpen={(drama, restore) => {
        selected.set(drama.series_id);
        props.store.open(drama, restore);
      }}
      header={header}
    />
  );
}
