import { Scroll, Text, View, cleanup, effect, lifecycle, signal, type ViewRef } from 'nsh';
import type { Drama, Episode } from '@hongguo/core-client';
import type { Store } from '../store';
import {
  BackButton,
  Button,
  CinemaButton,
  Cover,
  EpisodeRange,
  ExpandableText,
  Notice,
  StoryFeature,
  UiText,
} from '@hongguo/ui';
import { createSeasons } from '../seasons';
import { createSeasonDetail, seasonEpisode } from '../season-detail';
import { SeasonPicker } from '../SeasonPicker';
import { DetailExtras } from '../DetailExtras';
import { createDetailFavorite } from '../detail-favorite';
import { LibrarySyncNotice } from '../LibrarySyncNotice';
import { FollowAction, FollowNotice } from '../FollowAction';
import { ReservationAction, ReservationNotice } from '../ReservationAction';

export function Detail(props: {
  drama: Drama;
  store: Store;
  active?: boolean;
  /** The caller asked for playback (the home hero); starts the first playable episode once. */
  autoplay?: boolean;
}) {
  const active = () => props.active !== false;
  const seasons = createSeasons(props.store.request, () => props.drama, active);
  const browse = createSeasonDetail(props.store.request, seasons, active);
  const reservationOwner = {};
  effect(() => {
    props.store.reservationDetailActive(
      reservationOwner,
      active() &&
        lifecycle() === 'active' &&
        seasons.availability() === 'upcoming' &&
        !!seasons.selected()?.reservation_id,
    );
  });
  cleanup(() => props.store.reservationDetailActive(reservationOwner, false));
  const current = () => browse.summary() ?? props.drama;
  const favorite = createDetailFavorite(
    props.store,
    () => {
      const summary = browse.summary();
      return summary?.series_id === seasons.selectedId() ? summary : undefined;
    },
    () => active() && lifecycle() === 'active',
  );
  const segment = signal(0);
  const pageSize = props.store.target === 'tv' ? 12 : 24;
  const columns = () => (props.store.target === 'tv' ? 6 : 8);
  const resume = () => props.store.resume(current());
  const episodes = () => browse.drama()?.episodes ?? [];
  const saved = () =>
    episodes().find((episode) => episode.video_id === resume()?.video_id && !episode.locked);
  const startEpisode = () => saved() ?? episodes().find((episode) => !episode.locked);
  let initialized = '';
  let selected = '';
  let startRef: ViewRef | undefined;
  effect(() => {
    const key = JSON.stringify([seasons.selectedId(), current().content_type ?? '']);
    if (selected !== key) {
      selected = key;
      initialized = '';
      segment.set(0);
    }
    if (!browse.drama() || initialized === key) return;
    initialized = key;
    const index = episodes().findIndex((episode) => episode.video_id === resume()?.video_id);
    segment.set(Math.max(0, Math.floor(index / pageSize)));
  });
  const play = (episode: Episode, source?: ViewRef) => {
    const drama = browse.drama();
    const member = seasonEpisode(drama, episode);
    if (
      !active() ||
      lifecycle() !== 'active' ||
      !drama ||
      drama.series_id !== seasons.selectedId() ||
      !member
    )
      return;
    props.store.noteFocusIntent();
    props.store.play(drama, member, source);
  };

  let autoplayed = false;
  effect(() => {
    if (!props.autoplay || autoplayed || !active() || lifecycle() !== 'active') return;
    const episode = startEpisode();
    if (!episode) return;
    autoplayed = true;
    play(episode);
  });
  const startLabel = () =>
    seasons.availability() === 'upcoming'
      ? '尚未上线'
      : seasons.availability() === 'unavailable'
        ? '暂不可观看'
        : !resume()?.video_id
          ? '开始观看'
          : saved()
            ? `${resume()?.completed ? '重新观看' : '继续'}第 ${saved()!.index} 集`
            : `从第 ${startEpisode()?.index ?? 1} 集开始`;
  const meta = () => {
    const count = episodes().length || current().episode_count;
    const availability = seasons.availability();
    return [
      availability === 'upcoming'
        ? '待上线'
        : availability === 'unavailable'
          ? '暂不可观看'
          : count
            ? `${count} 集`
            : '',
      ...(current().tags ?? []),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  return (
    <Scroll
      testID="detail-scroll"
      class="flex-1"
      contentStyle={{
        paddingHorizontal: props.store.target === 'tv' ? 0 : 40,
        paddingBottom: props.store.target === 'tv' ? 16 : 40,
        paddingTop: props.store.target === 'tv' ? 6 : 12,
        gap: 32,
        width: '100%',
        alignItems: 'stretch',
      }}
    >
      <View class="w-full gap-8">
        <BackButton
          testID="detail-back"
          label={props.store.backLabel()}
          onPress={() => props.store.back()}
        />
        <If
          when={props.store.target === 'tv'}
          else={
            <View class="flex-row gap-10 max-w-[1000px] items-center">
              <Cover
                src={current().cover_fallback || current().cover}
                title={current().title}
                class="w-[200px] h-[280px]"
              />
              <View class="flex-1 gap-3">
                <UiText role="page" lines={2}>
                  {current().title}
                </UiText>
                <UiText role="meta" tone="muted">
                  {meta()}
                </UiText>
                {/* The contract allows 1024 characters, so the prose collapses to four lines with
                    its own disclosure: nothing is permanently cut off, and the actions stay near
                    the fold. */}
                <ExpandableText
                  testID="detail-intro"
                  text={current().intro || '暂无简介'}
                  collapsedLines={4}
                />
                <View class="flex-row flex-wrap items-center gap-3 pt-3">
                  <Button
                    testID="detail-start"
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
                  <FavoriteButton favorite={favorite} />
                  <FollowAction
                    store={props.store}
                    drama={
                      browse.summary()?.series_id === seasons.selectedId()
                        ? browse.summary()
                        : undefined
                    }
                    active={active() && lifecycle() === 'active'}
                  />
                </View>
              </View>
            </View>
          }
        >
          <StoryFeature
            detail
            title={current().title}
            image={current().cover_fallback || current().cover}
            meta={meta()}
            description={current().intro}
          >
            <View class="flex-row flex-wrap items-center" style={{ gap: 8 }}>
              <Button
                testID="detail-start"
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
              <FavoriteButton favorite={favorite} cinema />
              <FollowAction
                cinema
                store={props.store}
                drama={
                  browse.summary()?.series_id === seasons.selectedId()
                    ? browse.summary()
                    : undefined
                }
                active={active() && lifecycle() === 'active'}
              />
            </View>
          </StoryFeature>
        </If>
        <FollowNotice
          store={props.store}
          active={active() && lifecycle() === 'active'}
          testID="detail-follow-state"
        />
        <LibrarySyncNotice store={props.store} active={active()} testID="detail-library-sync" />
        <If when={favorite.message()}>
          <View class="gap-3">
            <Notice testID="detail-favorite-error" error message={favorite.message() ?? ''} />
            <If when={favorite.retryable()}>
              <View class="flex-row">
                <Button
                  testID="detail-favorite-retry"
                  label={favorite.retryLabel()}
                  onPress={() => void favorite.retry()}
                />
              </View>
            </If>
          </View>
        </If>
        <If when={browse.loading()}>
          <Text testID="detail-episodes-loading" class="text-base text-muted-foreground">
            {episodes().length ? '正在加载演员与相关作品…' : '正在加载详情与选集…'}
          </Text>
        </If>
        <If when={browse.error()}>
          <Notice
            testID="detail-episodes-error"
            error
            message={browse.error()}
            retry={browse.retry}
          />
        </If>
        <If when={browse.drama() && resume()?.video_id && !saved()}>
          <Notice message="原观看集已不可用，可选择其他已开放集数从头观看。" />
        </If>
        <View
          style={{
            maxWidth: props.store.target === 'tv' ? 610 : 1000,
            gap: props.store.target === 'tv' ? 12 : 20,
          }}
        >
          <UiText role="section">选集</UiText>
          <SeasonPicker
            seasons={seasons}
            resume={props.store.resume}
            onChange={props.store.noteFocusIntent}
          />
          <If when={seasons.availability() === 'upcoming'}>
            <Notice message="该季尚未上线，没有可播放的选集。" />
            <View class="self-start">
              <ReservationAction
                store={props.store}
                target={
                  seasons.selected()?.reservation_id
                    ? { kind: 'series', id: seasons.selected()!.reservation_id! }
                    : undefined
                }
                active={active() && lifecycle() === 'active'}
                testID="detail-reservation"
              />
            </View>
            <ReservationNotice
              store={props.store}
              active={active() && lifecycle() === 'active'}
              testID="detail-reservation-state"
            />
          </If>
          <If when={seasons.availability() === 'unavailable'}>
            <Notice message="这一季暂时无法观看。" />
          </If>
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
            style={{ rowGap: props.store.target === 'tv' ? 10 : 12 }}
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
                      paddingRight: props.store.target === 'tv' ? 10 : 12,
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
        <If when={browse.drama() && !episodes().length}>
          <Notice message="暂时没有可观看的选集。" />
        </If>
        <DetailExtras
          detail={browse.detail()}
          collection={JSON.stringify([
            props.drama.series_id,
            props.drama.content_type ?? '',
            seasons.selectedId(),
            current().content_type ?? '',
          ])}
          active={active()}
          store={props.store}
        />
      </View>
    </Scroll>
  );
}

function FavoriteButton(props: {
  favorite: ReturnType<typeof createDetailFavorite>;
  /** The dark story band pairs its secondary actions with the cinema controls. */
  cinema?: boolean;
}) {
  return (
    <If
      when={props.cinema}
      else={
        <Button
          testID="detail-favorite"
          label={props.favorite.selected() ? '已收藏' : '收藏'}
          icon="bookmark"
          selected={props.favorite.selected()}
          pending={props.favorite.pending()}
          disabled={props.favorite.disabled()}
          onPress={() => void props.favorite.press()}
        />
      }
    >
      <CinemaButton
        testID="detail-favorite"
        label={props.favorite.selected() ? '已收藏' : '收藏'}
        icon="bookmark"
        selected={props.favorite.selected()}
        pending={props.favorite.pending()}
        disabled={props.favorite.disabled()}
        onPress={() => void props.favorite.press()}
      />
    </If>
  );
}
