import { Scroll, View, fontScale, reduceMotion, signal, type ViewRef } from 'nsh';
import { CardControls, Notice, SeasonChoice, controlMetrics, space } from '@hongguo/ui';
import type { SeasonsController } from './seasons';
import type { Drama, SeriesSeason } from '@hongguo/core-client';

export interface SeasonPickerProps {
  seasons: SeasonsController;
  onChange?: (id: string) => void;
  compact?: boolean;
  playingId?: string;
  resume?: (drama: Drama) => { video_id?: string; completed?: boolean } | undefined;
}

/** Browse the complete service order; confirming a season never starts playback. */
export function SeasonPicker(props: SeasonPickerProps) {
  const contentHeight = signal(0);
  const size = () => (props.compact ? 'sm' : 'md');
  const inset = () => space('xs');
  const choose = (id: string) => {
    if (props.seasons.select(id)) props.onChange?.(id);
  };
  const playbackStatus = (drama: Drama) => {
    if (drama.series_id === props.playingId) return '播放中';
    const saved = props.resume?.(drama);
    return saved?.video_id && !saved.completed ? '可续播' : undefined;
  };
  const status = (row: SeriesSeason) =>
    row.upcoming
      ? '待上线'
      : !row.playable
        ? '暂不可观看'
        : (playbackStatus(row.drama) ?? '可观看');
  const missingSource = () => {
    const source = props.seasons.source();
    return source && !props.seasons.items().some((row) => row.drama.series_id === source.series_id)
      ? source
      : undefined;
  };
  const reveal = (ref?: ViewRef) =>
    ref?.reveal({ horizontal: 'nearest', vertical: 'nearest', animated: !reduceMotion() });
  return (
    <If when={props.seasons.items().length || props.seasons.error()}>
      <View class="gap-3" testID="season-picker">
        <If when={props.seasons.items().length}>
          <Scroll
            horizontal
            testID="season-scroll"
            style={{
              height: Math.max(
                controlMetrics(size()).height * fontScale() + inset() * 2,
                contentHeight() + inset() * 2,
              ),
              flexShrink: 0,
            }}
            contentStyle={{ padding: inset() }}
          >
            <View onLayout={({ bounds }) => contentHeight.set(bounds.size.height)}>
              <CardControls label="系列选季" class="gap-3 flex-nowrap items-start">
                <If when={missingSource()}>
                  {(source) => {
                    let ref: ViewRef | undefined;
                    return (
                      <SeasonChoice
                        testID="season-source"
                        size={size()}
                        title={source().title}
                        status={playbackStatus(source())}
                        selected={props.seasons.selectedId() === source().series_id}
                        buttonRef={(value) => (ref = value)}
                        onFocus={() => reveal(ref)}
                        onPress={() => choose(source().series_id)}
                      />
                    );
                  }}
                </If>
                <Each
                  of={Array.from({ length: props.seasons.items().length }, (_, index) => index)}
                >
                  {(slot) => {
                    const row = () => props.seasons.items()[slot()];
                    let ref: ViewRef | undefined;
                    return (
                      <If when={row()}>
                        {(item) => (
                          <SeasonChoice
                            testID={`season-${item().drama.series_id}`}
                            size={size()}
                            title={item().label?.trim() || item().drama.title}
                            status={status(item())}
                            selected={props.seasons.selectedId() === item().drama.series_id}
                            buttonRef={(value) => (ref = value)}
                            onFocus={() => reveal(ref)}
                            onPress={() => choose(item().drama.series_id)}
                          />
                        )}
                      </If>
                    );
                  }}
                </Each>
              </CardControls>
            </View>
          </Scroll>
        </If>
        <If when={props.seasons.error()}>
          <Notice error message={props.seasons.error()} retry={() => props.seasons.retry()} />
        </If>
      </View>
    </If>
  );
}
