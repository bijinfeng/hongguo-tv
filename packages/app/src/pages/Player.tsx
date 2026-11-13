import {
  Video,
  Text,
  View,
  resource,
  signal,
  cleanup,
  effect,
  lifecycle,
  type VideoRef,
} from 'nsh';
import { play, type Drama, type Episode } from '@hongguo/core-client';
import { type Store } from '../store';
import { progressSession } from '../playback';
import { Button, Notice, Controls } from '@hongguo/ui';

export function Player(props: { drama: Drama; episode: Episode; store: Store }) {
  const info = resource(
    () =>
      lifecycle() === 'background' ? undefined : { drama: props.drama, episode: props.episode },
    (value, { signal }) => play(value.drama, value.episode, signal),
  );
  const paused = signal(false);
  const position = signal(0);
  const duration = signal(0);
  const error = signal('');
  const buffering = signal(true);
  let video: VideoRef | undefined;
  const session = progressSession((time, total, completed) => {
    void props.store.save(props.drama, props.episode, time, total, completed);
  });
  const save = () => session.save();
  const next = () =>
    props.drama.episodes?.find((e) => e.index === props.episode.index + 1 && !e.locked);
  const nextEpisode = () => {
    const ep = next();
    if (ep) {
      save();
      props.store.nav.replace({ name: 'player', drama: props.drama, episode: ep });
    }
  };
  const toggle = () => {
    paused.update((p) => !p);
    if (paused()) save();
  };
  effect(() => {
    if (lifecycle() === 'background') {
      paused.set(true);
      save();
    }
  });
  cleanup(() => save());
  return (
    <View class="flex-1 gap-4 p-5 md:p-8">
      <Text class="text-xl font-semibold text-foreground">
        {props.drama.title} · 第 {props.episode.index} 集
      </Text>
      <View class="flex-1 min-h-48 rounded-(--radius) bg-cinema justify-center">
        <If when={info()}>
          {(value) => (
            <Video
              ref={(ref) => {
                video = ref;
              }}
              src={value().url}
              paused={paused()}
              controls={false}
              progressUpdateInterval={1000}
              class="flex-1"
              onLoad={({ duration }) => {
                buffering.set(false);
                const entry = props.store.resume(props.drama);
                if (
                  entry?.video_id === props.episode.video_id &&
                  !entry.completed &&
                  entry.position &&
                  entry.position < duration - 3
                )
                  video?.seek(entry.position);
              }}
              onProgress={(event) => {
                position.set(event.currentTime);
                duration.set(event.duration);
                session.update(event.currentTime, event.duration, !paused());
              }}
              onBuffer={({ isBuffering }) => buffering.set(isBuffering)}
              onError={({ message }) => {
                error.set(`播放失败：${message}`);
                buffering.set(false);
              }}
              onEnd={() => {
                session.end();
                if (next()) nextEpisode();
                else paused.set(true);
              }}
            />
          )}
        </If>
        <If when={info.loading() || (buffering() && !error() && !info.error())}>
          <Text class="text-base text-cinema-foreground p-4">正在准备播放…</Text>
        </If>
      </View>
      <If when={info.error() || error()}>
        <Notice
          error
          message={error() || `无法获取播放地址：${String(info.error())}`}
          retry={() => {
            error.set('');
            info.refetch();
          }}
        />
      </If>
      <Text class="text-sm text-muted-foreground">
        {Math.floor(position())} / {Math.floor(duration())} 秒
      </Text>
      <Controls label="播放控制">
        <Button label={paused() ? '播放' : '暂停'} primary onPress={toggle} disabled={!info()} />
        <Button
          label="后退 10 秒"
          onPress={() => video?.seek(Math.max(0, position() - 10))}
          disabled={!info()}
        />
        <Button
          label="前进 10 秒"
          onPress={() => video?.seek(Math.min(duration(), position() + 10))}
          disabled={!info()}
        />
        <Button label="下一集" onPress={nextEpisode} disabled={!next()} />
      </Controls>
      <If when={props.store.warning()}>
        <View class="gap-3">
          <Text class="text-base text-destructive">{props.store.warning()}</Text>
          <Button label="重试保存" onPress={session.retry} />
        </View>
      </If>
    </View>
  );
}
