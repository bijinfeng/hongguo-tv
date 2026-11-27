import { View } from 'nsh';
import type { Drama, Episode } from '@hongguo/core-client';
import { CinemaText, EpisodeRail, space } from '@hongguo/ui';
import type { Store } from '../../store';
import type { createSeasonDetail } from '../../season-detail';
import type { SeasonsController } from '../../seasons';
import { SeasonEpisodes } from './SeasonEpisodes';

/**
 * The desktop player's episode rail: a titled dark panel beside the picture. Season and episode
 * browsing reuse the shared `SeasonEpisodes` list, so the rail never invents its own paging,
 * availability or selection rules.
 */
export function PlayerEpisodeRail(props: {
  seasons: SeasonsController;
  detail: ReturnType<typeof createSeasonDetail>;
  drama: Drama;
  episode: Episode;
  playingId?: string;
  resume: Store['resume'];
  onBrowse: () => void;
  onSelect: (drama: Drama, episode: Episode) => void;
}) {
  return (
    <EpisodeRail cinema>
      <View class="flex-1 min-h-0" style={{ padding: space('md'), gap: space('md') }}>
        <CinemaText variant="title" testID="player-episodes-title">
          选集
        </CinemaText>
        <SeasonEpisodes
          cinema
          seasons={props.seasons}
          detail={props.detail}
          drama={props.drama}
          episode={props.episode}
          target="desktop"
          playingId={props.playingId}
          resume={props.resume}
          onBrowse={props.onBrowse}
          onSelect={props.onSelect}
        />
      </View>
    </EpisodeRail>
  );
}
