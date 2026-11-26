import { View, signal } from 'nsh';
import { Button, UiText } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import { Episodes } from '../src/pages/player/SeasonEpisodes';

/** Synthetic boundaries around the production grid, without a media session or history writes. */
export function EpisodeGridFixture() {
  const episodes = Array.from({ length: 1000 }, (_, index) => ({
    index: index + 1,
    video_id: String(index + 1),
    locked: index === 999,
  }));
  const drama: Drama = { series_id: '1', title: '合成千集', cover: '', intro: '', episodes };
  const playing = signal(0);
  const selected = signal(0);
  return (
    <View class="flex-1 bg-background p-6 gap-4">
      <Button label="外部切至第500集" onPress={() => playing.set(499)} />
      <UiText>{`playing:${playing() + 1} · selected:${selected()}`}</UiText>
      <Episodes
        drama={drama}
        current={episodes[playing()]}
        target="tv"
        onSelect={(episode) => selected.set(episode.index)}
      />
    </View>
  );
}
