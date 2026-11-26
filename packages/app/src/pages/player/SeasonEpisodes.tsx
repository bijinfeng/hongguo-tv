import { Scroll, Text, View, effect, signal, untracked } from 'nsh';
import type { Drama, Episode } from '@hongguo/core-client';
import { Button, CinemaEpisodeButton, CinemaSelect, EpisodeRange, Notice } from '@hongguo/ui';
import type { Store } from '../../store';
import type { SeasonsController } from '../../seasons';
import type { createSeasonDetail } from '../../season-detail';
import { SeasonPicker } from '../../SeasonPicker';
import { tvColumns } from '../../shell/tv-layout';

/** Compact season switcher for the player rail; the shared picker keeps the reading order. */
function RailSeasons(props: {
  seasons: SeasonsController;
  playingId?: string;
  resume: Store['resume'];
  onBrowse: () => void;
}) {
  return (
    <SeasonPicker
      seasons={props.seasons}
      compact
      playingId={props.playingId}
      resume={props.resume}
      onChange={props.onBrowse}
    />
  );
}

/**
 * Season switcher drawn for the dark rail: one trigger, no page-level chrome. A single season
 * still shows its own label row, so the season identity stays addressable without a dropdown.
 */
function CinemaSeasons(props: {
  seasons: SeasonsController;
  playingId?: string;
  resume: Store['resume'];
  onBrowse: () => void;
}) {
  const rows = () => props.seasons.items();
  const title = (row: { label?: string; season_index?: number; drama: Drama }) =>
    row.label ?? (row.season_index ? `第 ${row.season_index} 季` : row.drama.title);
  return (
    <If when={rows().length > 1} else={<CinemaSeasonLabel {...props} />}>
      <CinemaSelect
        label="当前季"
        value={props.seasons.selectedId()}
        items={rows().map((row) => ({ value: row.drama.series_id, title: title(row) }))}
        onChange={(value) => {
          if (props.seasons.select(value)) props.onBrowse();
        }}
      />
    </If>
  );
}

/** One known season: the same row identity the switcher's options carry. */
function CinemaSeasonLabel(props: {
  seasons: SeasonsController;
  playingId?: string;
  resume: Store['resume'];
}) {
  const current = () =>
    props.seasons.items().find((row) => row.drama.series_id === props.seasons.selectedId()) ??
    props.seasons.items()[0];
  return (
    <If when={current()}>
      {(row) => (
        <View testID={`season-${row().drama.series_id}`} class="flex-row items-center">
          <Text class="text-cinema-foreground" style={{ fontSize: 14 }}>
            {row().label?.trim() || row().drama.title}
          </Text>
        </View>
      )}
    </If>
  );
}

/** Episode grid for the current season; paging and availability come from the service rows. */
export function Episodes(props: {
  drama: Drama;
  current?: Episode;
  target: 'desktop' | 'tv';
  cinema?: boolean;
  onSelect: (episode: Episode) => void;
}) {
  const width = signal(0);
  const size = 24;
  const episodes = () => props.drama.episodes ?? [];
  const initial = episodes().findIndex((episode) => episode.video_id === props.current?.video_id);
  const segment = signal(Math.max(0, Math.floor(initial / size)));
  // The current episode can move to another segment without this grid remounting (next episode,
  // auto-advance, a resumed position); the range follows it once its episode is present.
  let shown = '';
  effect(() => {
    const id = props.current?.video_id ?? '';
    const index = episodes().findIndex((episode) => episode.video_id === id);
    if (!id || index < 0) return;
    const key = `${props.drama.series_id}:${id}:${index}`;
    untracked(() => {
      if (key === shown) return;
      shown = key;
      segment.set(Math.max(0, Math.floor(index / size)));
    });
  });
  return (
    <View class={props.cinema ? 'flex-1 min-h-0 items-start gap-4' : 'flex-1 gap-5'}>
      <EpisodeRange
        value={segment()}
        count={episodes().length}
        pageSize={size}
        cinema={props.cinema}
        onChange={segment.set}
      />
      {/* `items-start` keeps the trigger at its own width; the grid keeps the lane's and scrolls. */}
      <Scroll
        class={props.cinema ? 'flex-1 min-h-0 w-full' : 'flex-1'}
        contentStyle={{ width: '100%', paddingBottom: 12 }}
      >
        <View
          class="flex-row flex-wrap"
          onLayout={({ bounds }) => {
            if (bounds.size.width > 0) width.set(bounds.size.width);
          }}
          style={{ rowGap: 8 }}
        >
          <Each
            of={episodes().slice(segment() * size, (segment() + 1) * size)}
            key={(episode) => episode.video_id}
          >
            {(episode) => (
              <View
                style={{
                  width: `${100 / (props.target === 'tv' ? tvColumns('episodes', width()) : 4)}%`,
                  paddingRight: 8,
                }}
              >
                <If
                  when={props.cinema}
                  else={
                    <Button
                      testID={`player-episode-${episode().video_id}`}
                      episode="player"
                      label={`第 ${episode().index} 集${episode().locked ? ' · 未开放' : ''}`}
                      displayLabel={
                        props.target === 'tv'
                          ? String(episode().index)
                          : String(episode().index).padStart(2, '0')
                      }
                      icon={episode().locked ? 'lock' : undefined}
                      disabled={episode().locked}
                      selected={episode().video_id === props.current?.video_id}
                      onPress={() => props.onSelect(episode())}
                    />
                  }
                >
                  <CinemaEpisodeButton
                    testID={`player-episode-${episode().video_id}`}
                    index={episode().index}
                    label={`第 ${episode().index} 集${episode().locked ? ' · 未开放' : ''}`}
                    locked={episode().locked}
                    selected={episode().video_id === props.current?.video_id}
                    onPress={() => props.onSelect(episode())}
                  />
                </If>
              </View>
            )}
          </Each>
        </View>
      </Scroll>
    </View>
  );
}

/**
 * The season's title, loading and failure states above the episode grid. The same component
 * serves the desktop rail and the TV panel; `cinema` swaps the text and retry pairing.
 */
export function SeasonEpisodes(props: {
  seasons: SeasonsController;
  detail: ReturnType<typeof createSeasonDetail>;
  drama: Drama;
  episode: Episode;
  target: 'desktop' | 'tv';
  playingId?: string;
  resume: Store['resume'];
  onBrowse: () => void;
  onSelect: (drama: Drama, episode: Episode) => void;
  cinema?: boolean;
}) {
  const summary = () => props.detail.summary();
  return (
    <View class={props.cinema ? 'flex-1 min-h-0 items-start gap-4' : 'flex-1 gap-4'}>
      <If when={props.cinema} else={<RailSeasons {...props} />}>
        <CinemaSeasons {...props} />
      </If>
      <If when={!props.cinema}>
        <Text role="header" accessibilityLevel={2} class="text-lg font-semibold text-foreground">
          {summary()?.title ?? props.drama.title}
        </Text>
      </If>
      <If when={props.detail.loading()}>
        <Notice message="正在加载选集…" />
      </If>
      <If when={props.detail.error()}>
        <Notice error message={props.detail.error()} retry={props.detail.retry} />
      </If>
      <If when={!props.detail.loading() && !props.detail.error() && !props.detail.drama()}>
        <Notice
          message={props.seasons.availability() === 'upcoming' ? '本季待上线' : '本季暂不可观看'}
        />
      </If>
      <If when={props.detail.drama()} else={<View />}>
        <Episodes
          drama={props.detail.drama()!}
          current={
            props.detail.drama()!.series_id === props.drama.series_id ? props.episode : undefined
          }
          target={props.target}
          cinema={props.cinema}
          onSelect={(episode) => props.onSelect(props.detail.drama()!, episode)}
        />
      </If>
    </View>
  );
}
