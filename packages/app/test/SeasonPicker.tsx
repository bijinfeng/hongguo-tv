import { Scroll, View, signal } from 'nsh';
import { Button, Product, UiText, type ProductTarget } from '@hongguo/ui';
import type { Drama, SeriesSeason } from '@hongguo/core-client';
import { SeasonPicker } from '../src/SeasonPicker';
import { createSeasons } from '../src/seasons';

const drama = (id: string, title = `作品${id}`): Drama => ({
  series_id: id,
  title,
  cover: '',
  intro: '',
  episode_count: 2,
});
const rows: SeriesSeason[] = [
  {
    drama: drama('200'),
    label: ' 官方第二季 ',
    playable: true,
    upcoming: false,
    first_video_id: '2001',
  },
  { drama: drama('300', '未编号的新故事'), label: ' ', playable: false, upcoming: true },
  { drama: drama('400'), playable: false, upcoming: false },
];

function PickerFacts() {
  const active = signal(true);
  const changes = signal<string[]>([]);
  const reads = signal(0);
  const failure = signal(false);
  const source = signal(drama('100', '原始作品'));
  const playingId = signal<string | undefined>();
  const saved = signal<{ video_id?: string; completed?: boolean } | undefined>();
  const seasons = createSeasons(
    async <T,>(path: string, _abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined || !path.startsWith('/api/v1/series/seasons?series_id='))
        throw new Error('Unexpected side effect');
      reads.set(reads() + 1);
      if (failure()) throw new Error('Synthetic catalog failure');
      return { items: rows } as T;
    },
    source,
    active,
  );
  return (
    <View class="flex-1 gap-4">
      <View class="flex-row flex-wrap gap-3">
        <Button label="停用选择" testID="picker-inactive" onPress={() => active.set(false)} />
        <Button label="启用选择" testID="picker-active" onPress={() => active.set(true)} />
        <Button
          label="失败新来源"
          testID="picker-fail"
          onPress={() => {
            failure.set(true);
            source.set(drama('900'));
          }}
        />
        <Button label="恢复服务" testID="picker-recover" onPress={() => failure.set(false)} />
        <Button
          label="原季正在播放"
          testID="picker-playing-source"
          onPress={() => playingId.set('100')}
        />
        <Button
          label="第二季正在播放"
          testID="picker-playing-second"
          onPress={() => playingId.set('200')}
        />
        <Button
          label="清除播放状态"
          testID="picker-playing-none"
          onPress={() => playingId.set(undefined)}
        />
        <Button
          label="第二季未看完"
          testID="picker-resumable"
          onPress={() => saved.set({ video_id: '2001', completed: false })}
        />
        <Button
          label="第二季已看完"
          testID="picker-completed"
          onPress={() => saved.set({ video_id: '2001', completed: true })}
        />
        <Button
          label="第二季无有效进度"
          testID="picker-no-video"
          onPress={() => saved.set({ completed: false })}
        />
      </View>
      <UiText>{`picker:selected:${seasons.selectedId()} · availability:${seasons.availability()}`}</UiText>
      <UiText>{`picker:changes:${changes().join(',') || 'none'} · reads:${reads()}`}</UiText>
      <UiText>{`picker:playing:${playingId() ?? 'none'}`}</UiText>
      <UiText>{`picker:order:${seasons
        .items()
        .map((row) => row.drama.series_id)
        .join(',')}`}</UiText>
      <Scroll class="flex-1">
        <View class="py-2">
          <SeasonPicker
            seasons={seasons}
            playingId={playingId()}
            resume={(drama) => (drama.series_id === '200' ? saved() : undefined)}
            onChange={(id) => changes.update((all) => [...all, id])}
          />
        </View>
      </Scroll>
    </View>
  );
}

/** Real-controller preview composed only from the UI package's public controls. */
export function SeasonComponents(props: { target: ProductTarget }) {
  return (
    <Product.Provider value={props.target}>
      <View class="flex-1 bg-background p-8 gap-4">
        <PickerFacts />
      </View>
    </Product.Provider>
  );
}
