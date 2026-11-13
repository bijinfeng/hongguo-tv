import { Scroll, Text, View, effect, resource, signal, type ViewRef } from 'nsh';
import { detail, type Drama, type Episode } from '@hongguo/core-client';
import type { Store } from '../store';
import { Button, Cover, EpisodeRange, Notice, StoryFeature, tvUnit } from '@hongguo/ui';

export function Detail(props: { drama: Drama; store: Store }) {
  const result = resource(
    () => props.drama,
    (drama, { signal }) => detail(drama, signal),
  );
  const segment = signal(0);
  const pageSize = props.store.target === 'tv' ? 12 : 24;
  const columns = () => (props.store.target === 'tv' ? 6 : 8);
  const resume = () => props.store.resume(props.drama);
  const episodes = () => result()?.episodes ?? [];
  const saved = () =>
    episodes().find((episode) => episode.video_id === resume()?.video_id && !episode.locked);
  const startEpisode = () => saved() ?? episodes().find((episode) => !episode.locked);
  let initialized = false;
  let startRef: ViewRef | undefined;
  effect(() => {
    if (!episodes().length || initialized) return;
    initialized = true;
    const index = episodes().findIndex((episode) => episode.video_id === resume()?.video_id);
    segment.set(Math.max(0, Math.floor(index / pageSize)));
  });
  const play = (episode: Episode, source?: ViewRef) => {
    if (result() && !episode.locked) props.store.play(result()!, episode, source);
  };
  const startLabel = () =>
    !resume()?.video_id
      ? '开始观看'
      : saved()
        ? `${resume()?.completed ? '重新观看' : '继续'}第 ${saved()!.index} 集`
        : `从第 ${startEpisode()?.index ?? 1} 集开始`;
  return (
    <Scroll
      testID="detail-scroll"
      class="flex-1"
      contentStyle={{
        paddingHorizontal: props.store.target === 'tv' ? 0 : 40,
        paddingBottom: props.store.target === 'tv' ? tvUnit(32) : 40,
        paddingTop: props.store.target === 'tv' ? tvUnit(12) : 12,
        gap: 32,
        width: '100%',
        alignItems: 'stretch',
      }}
    >
      <View class="w-full gap-8">
        <If
          when={props.store.target === 'tv'}
          else={
            <View class="flex-row gap-10 max-w-[1000px] items-center">
              <Cover
                src={props.drama.cover_fallback || props.drama.cover}
                title={props.drama.title}
                class="w-[200px] h-[280px]"
              />
              <View class="flex-1 gap-3">
                <Text class="text-[32px] font-semibold text-foreground">{props.drama.title}</Text>
                <Text class="text-base text-muted-foreground">
                  {episodes().length || props.drama.episode_count || 0} 集　
                  {(result()?.tags ?? props.drama.tags ?? []).join(' · ')}
                </Text>
                <Text class="text-base text-foreground">
                  {result()?.intro || props.drama.intro || '暂无简介'}
                </Text>
                <View class="items-start pt-3">
                  <Button
                    buttonRef={(ref) => {
                      startRef = ref;
                    }}
                    label={startLabel()}
                    primary
                    icon="play"
                    disabled={!startEpisode()}
                    onPress={() => {
                      const episode = startEpisode();
                      if (episode) play(episode, startRef);
                    }}
                  />
                </View>
              </View>
            </View>
          }
        >
          <StoryFeature
            detail
            title={props.drama.title}
            image={props.drama.cover_fallback || props.drama.cover}
            meta={`${episodes().length || props.drama.episode_count || 0} 集　${(result()?.tags ?? props.drama.tags ?? []).join(' · ')}`}
            description={result()?.intro || props.drama.intro}
          >
            <Button
              primary
              icon="play"
              label={startLabel()}
              disabled={!startEpisode()}
              buttonRef={(ref) => {
                startRef = ref;
              }}
              onPress={() => {
                const episode = startEpisode();
                if (episode) play(episode, startRef);
              }}
            />
          </StoryFeature>
        </If>
        <If when={result.loading()}>
          <Text class="text-base text-muted-foreground">正在加载选集…</Text>
        </If>
        <If when={result.error()}>
          <Notice
            error
            message={`详情加载失败：${String(result.error())}`}
            retry={result.refetch}
          />
        </If>
        <If when={result.state() === 'ready' && resume()?.video_id && !saved()}>
          <Notice message="原观看集已不可用，可选择其他已开放集数从头观看。" />
        </If>
        <View
          style={{
            maxWidth: props.store.target === 'tv' ? tvUnit(1220) : 1000,
            gap: props.store.target === 'tv' ? tvUnit(24) : 20,
          }}
        >
          <Text
            style={props.store.target === 'tv' ? { fontSize: tvUnit(28) } : undefined}
            class={`${props.store.target === 'tv' ? 'text-2xl' : 'text-xl'} font-semibold text-foreground`}
          >
            选集
          </Text>
          <If when={episodes().length}>
            <View class="flex-row items-center justify-between">
              <EpisodeRange
                value={segment()}
                count={episodes().length}
                pageSize={pageSize}
                onChange={segment.set}
              />
              <Button
                variant="quiet"
                label="定位当前集"
                compact
                onPress={() => {
                  const index = episodes().findIndex(
                    (episode) => episode.video_id === resume()?.video_id,
                  );
                  segment.set(Math.max(0, Math.floor(index / pageSize)));
                }}
              />
            </View>
          </If>
          <View
            class="flex-row flex-wrap"
            style={{ rowGap: props.store.target === 'tv' ? tvUnit(20) : 12 }}
          >
            <Each
              of={episodes().slice(segment() * pageSize, (segment() + 1) * pageSize)}
              key={(episode) => episode.video_id}
            >
              {(episode) => {
                let ref: ViewRef | undefined;
                return (
                  <View
                    style={{
                      width: `${100 / columns()}%`,
                      paddingRight: props.store.target === 'tv' ? tvUnit(20) : 12,
                    }}
                  >
                    <Button
                      buttonRef={(node) => {
                        ref = node;
                      }}
                      testID={`episode-${episode().video_id}`}
                      label={`第 ${episode().index} 集${episode().locked ? ' · 未开放' : ''}`}
                      displayLabel={
                        props.store.target === 'tv'
                          ? `第 ${episode().index} 集`
                          : String(episode().index).padStart(2, '0')
                      }
                      episode
                      icon={episode().locked ? 'lock' : undefined}
                      disabled={episode().locked}
                      selected={episode().video_id === resume()?.video_id}
                      onPress={() => play(episode(), ref)}
                    />
                  </View>
                );
              }}
            </Each>
          </View>
        </View>
        <If when={result.state() === 'ready' && !episodes().length}>
          <Notice message="暂时没有可观看的选集。" />
        </If>
      </View>
    </Scroll>
  );
}
