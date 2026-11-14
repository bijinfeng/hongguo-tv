import {
  View,
  Text,
  Scroll,
  resource,
  signal,
  lifecycle,
  effect,
  untracked,
  batch,
  cleanup,
  type ViewRef,
} from 'nsh';
import { currentWindow, isAvailable } from 'nsh/desktop';
import { Button, CardControls, Notice, StoryFeature, ContentArrival, tvUnit } from '@hongguo/ui';
import type { Drama, Episode } from '@hongguo/core-client';
import { createFeed, type FeedChannel } from '../feed';
import { Player, type PlayerCheckpoint } from './Player';
import type { Store } from '../store';

const channels: { value: FeedChannel; label: string }[] = [
  { value: '16', label: '推荐' },
  { value: '39', label: '真人剧' },
  { value: '36', label: '漫剧' },
  { value: '45', label: '关注' },
];

export function Feed(props: { store: Store }) {
  const tv = props.store.target === 'tv';
  const active = () => props.store.activePage('feed');
  const feed = createFeed(props.store.request, active);
  const window = isAvailable ? currentWindow() : undefined;
  const fullScreen = () => !tv && window?.state()?.placement.mode === 'fullScreen';
  const selected = signal<Record<string, string>>({});
  const checkpoints = new Map<string, PlayerCheckpoint>();
  const storyKey = () => `${feed.channel()}:${feed.current()?.series_id ?? ''}`;
  const result = resource(
    () => (active() && lifecycle() === 'active' ? feed.current() : undefined),
    (drama, { signal }) =>
      props.store.request<Drama>(
        `/api/v1/series/detail?series_id=${encodeURIComponent(drama.series_id)}&content_type=${encodeURIComponent(drama.content_type ?? '')}`,
        signal,
      ),
  );
  const drama = () => (result()?.series_id === feed.current()?.series_id ? result() : undefined);
  const episode = () => {
    const episodes = drama()?.episodes ?? [];
    const current = drama() ?? feed.current();
    const video =
      selected()[storyKey()] ?? (current ? props.store.resume(current)?.video_id : undefined);
    return (
      episodes.find((item) => item.video_id === video && !item.locked) ??
      episodes.find((item) => !item.locked)
    );
  };
  const player = () =>
    drama() && episode()
      ? [{ key: `${storyKey()}:${episode()!.video_id}`, drama: drama()!, episode: episode()! }]
      : [];
  const nextLabel = () =>
    feed.loading() ? '正在加载…' : feed.state().error ? '重试下一部' : '下一部';
  const refs = new Map<string, ViewRef>();
  let nextRef: ViewRef | undefined;
  let frame = 0;
  const nextFocus = signal<(() => boolean) | undefined>(undefined);
  const next = () => {
    props.store.noteFocusIntent();
    batch(() => {
      nextFocus.set(props.store.focusGuard());
      feed.next();
    });
  };
  effect(() => {
    const owned = nextFocus();
    if (!owned || feed.loading() || (!tv && feed.current() && !drama() && result.loading())) return;
    untracked(() => {
      nextFocus.set(undefined);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (active() && owned())
            (feed.nextAvailable() ? nextRef : refs.get(feed.channel()))?.focus();
        });
      });
    });
  });
  cleanup(() => cancelAnimationFrame(frame));
  let detailRef: ViewRef | undefined;
  let playRef: ViewRef | undefined;
  const openDetails = () => {
    const current = drama() ?? feed.current();
    if (current) props.store.open(current, () => detailRef?.focus());
  };
  return (
    <View
      testID="feed-page"
      class="flex-1"
      style={{
        paddingHorizontal: tv || fullScreen() ? 0 : 40,
        paddingTop: fullScreen() ? 0 : tv ? tvUnit(32) : 28,
      }}
    >
      <View class={fullScreen() ? 'hidden' : 'gap-5 pb-6'}>
        <View class="flex-row items-center justify-between gap-4">
          <Text
            class="text-3xl font-semibold text-foreground"
            style={tv ? { fontSize: tvUnit(38) } : undefined}
          >
            刷剧
          </Text>
          <If
            when={tv}
            else={
              <Button
                label="查看详情"
                icon="list"
                variant="quiet"
                testID="feed-detail"
                disabled={!feed.current()}
                buttonRef={(ref) => {
                  detailRef = ref;
                }}
                onPress={openDetails}
              />
            }
          >
            <CardControls label="当前推荐" onNavigate={props.store.noteFocusIntent}>
              <Button
                testID="feed-next"
                label={nextLabel()}
                icon="next"
                disabled={!feed.nextAvailable() || feed.loading()}
                buttonRef={(ref) => {
                  nextRef = ref;
                }}
                onPress={next}
              />
              <Button
                testID="feed-play"
                label="进入全屏观看"
                icon="play"
                primary
                disabled={!episode()}
                buttonRef={(ref) => {
                  playRef = ref;
                }}
                onPress={() => {
                  if (drama() && episode()) props.store.play(drama()!, episode()!, playRef);
                }}
              />
            </CardControls>
          </If>
        </View>
        <CardControls label="刷剧频道" onNavigate={props.store.noteFocusIntent} class="gap-2">
          <Each of={channels} key={(channel) => channel.value}>
            {(channel) => (
              <Button
                compact
                variant="quiet"
                testID={`feed-channel-${channel().value}`}
                label={channel().label}
                selected={feed.channel() === channel().value}
                buttonRef={(ref) => {
                  refs.set(channel().value, ref);
                  if (tv && channel().value === '16') props.store.primaryRef('feed', ref);
                }}
                onPress={() => {
                  props.store.noteFocusIntent();
                  feed.select(channel().value);
                  if (tv) {
                    const ref = refs.get(channel().value);
                    if (ref) props.store.primaryRef('feed', ref);
                  }
                }}
              />
            )}
          </Each>
        </CardControls>
      </View>
      <If
        when={feed.channel() === '45'}
        else={
          <View class="flex-1 gap-4">
            <If when={feed.state().error}>
              <Notice
                error
                message={feed.state().error}
                retry={!feed.current() ? feed.retry : undefined}
              />
            </If>
            <If when={feed.loading() && !feed.current()}>
              <Notice message="正在读取推荐…" />
            </If>
            <If
              when={feed.current()}
              else={
                <If when={feed.state().page && !feed.loading() && !feed.state().error}>
                  <View class="items-start gap-4">
                    <Notice
                      message={
                        feed.state().page?.has_more
                          ? '本页暂无内容，可以继续浏览'
                          : '暂无推荐，试试其他频道'
                      }
                    />
                    <If when={feed.state().page?.has_more}>
                      <Button label="继续浏览" onPress={next} />
                    </If>
                  </View>
                </If>
              }
            >
              <If
                when={tv}
                else={
                  <View class="flex-1">
                    <If when={result.loading() && !drama()}>
                      <Notice message="正在加载选集…" />
                    </If>
                    <If when={result.error()}>
                      <Notice error message="选集加载失败，请重试。" retry={result.refetch} />
                    </If>
                    <If when={drama() && !episode()}>
                      <Notice message="暂时没有可观看的选集。" />
                    </If>
                    <Each of={player()} key={(item) => item.key}>
                      {(item) => {
                        // Captured identities keep outgoing cleanup from checkpointing into the new story.
                        const key = item().key;
                        const owner = storyKey();
                        const checkpoint = checkpoints.get(key);
                        return (
                          <ContentArrival class="flex-1">
                            <Player
                              drama={item().drama}
                              episode={item().episode}
                              store={props.store}
                              active={active()}
                              feed={{
                                checkpoint,
                                onCheckpoint: (value) => checkpoints.set(key, value),
                                onEpisode: (episode: Episode) =>
                                  selected.update((all) => ({ ...all, [owner]: episode.video_id })),
                                onLeave: () => {
                                  props.store.navigate('home');
                                  props.store.restoreFocus();
                                },
                                onNext: next,
                                nextLabel: nextLabel(),
                                nextDisabled: !feed.nextAvailable() || feed.loading(),
                                nextRef: (ref) => {
                                  nextRef = ref;
                                },
                              }}
                            />
                          </ContentArrival>
                        );
                      }}
                    </Each>
                  </View>
                }
              >
                <Scroll class="flex-1" contentClass="gap-5 pb-6">
                  <Each
                    of={feed.current() ? [{ key: storyKey(), drama: feed.current()! }] : []}
                    key={(item) => item.key}
                  >
                    {(item) => (
                      <ContentArrival>
                        <StoryFeature
                          detail
                          title={item().drama.title}
                          image={item().drama.cover_fallback || item().drama.cover}
                          meta={`${drama()?.episodes?.length || item().drama.episode_count || 0} 集　${(drama()?.tags ?? item().drama.tags ?? []).join(' · ')}`}
                          description={drama()?.intro || item().drama.intro}
                        >
                          <Button
                            testID="feed-detail"
                            label="选集与详情"
                            icon="list"
                            buttonRef={(ref) => {
                              detailRef = ref;
                            }}
                            onPress={openDetails}
                          />
                        </StoryFeature>
                      </ContentArrival>
                    )}
                  </Each>
                  <If when={result.loading()}>
                    <Notice message="正在加载选集…" />
                  </If>
                  <If when={result.error()}>
                    <Notice error message="选集加载失败，请重试。" retry={result.refetch} />
                  </If>
                  <If when={drama() && !episode()}>
                    <Notice message="暂时没有可观看的选集。" />
                  </If>
                </Scroll>
              </If>
            </If>
            <If when={!tv && feed.current() && (!drama() || !episode())}>
              <View class="items-start">
                <Button
                  testID="feed-next"
                  label={nextLabel()}
                  icon="next"
                  disabled={!feed.nextAvailable() || feed.loading()}
                  buttonRef={(ref) => {
                    nextRef = ref;
                  }}
                  onPress={next}
                />
              </View>
            </If>
          </View>
        }
      >
        <View class="gap-4 items-start">
          <Text class="text-xl font-semibold text-foreground">登录后查看关注</Text>
          <Button
            label="登录"
            primary
            onPress={() => {
              props.store.rememberSource(() => refs.get('45')?.focus());
              props.store.accountPage();
            }}
          />
        </View>
      </If>
    </View>
  );
}
