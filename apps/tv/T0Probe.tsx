import { Text, Video, View, lifecycle, mount, signal, type VideoRef } from 'nsh';
import { Button, Controls } from '@hongguo/ui';
import { T0Probe, T0Session, T0Task } from 'hongguo-tv/native';
import sampleA from './fixtures/t0-a.mp4';
import sampleB from './fixtures/t0-b.mp4';

function App() {
  const active = signal(true);
  const events = signal<string[]>([]);
  const paused = signal(true);
  const source = signal(0);
  const visible = signal(true);
  const position = signal(0);
  const loaded = signal(false);
  const failure = signal('');
  let video: VideoRef | undefined;
  const marker = T0Probe.ping();
  const session = new T0Session();
  const alive = session.state() === 'alive';
  session.dispose();
  let released = false;
  try {
    session.state();
  } catch (error) {
    released = alive && String(error).includes('disposed');
  }
  return (
    <View class="flex-1 gap-3 p-5 bg-background">
      <Text class="text-xl font-semibold text-foreground">红果 · TV T0</Text>
      <View class="flex-row gap-4">
        <Text class="text-base text-foreground">{marker}</Text>
        <Text class="text-base text-foreground">
          {released ? 'session-released' : 'session-release-failed'}
        </Text>
      </View>
      <If when={visible()}>
        <Video
          testID="t0-video"
          ref={(ref) => {
            video = ref;
          }}
          src={source() === 0 ? sampleA : sampleB}
          paused={paused() || lifecycle() !== 'active'}
          repeat
          class="flex-1 bg-cinema"
          onLoad={() => {
            loaded.set(true);
            video?.seek(position());
            console.log(`T0Video loaded ${source()}`);
          }}
          onProgress={({ currentTime }) => position.set(currentTime)}
          onError={({ message }) => failure.set(message)}
        />
      </If>
      <Text class="text-base text-foreground">
        {`video=${source()} loaded=${loaded()} paused=${paused()} time=${Math.floor(position())} lifecycle=${lifecycle()}`}
      </Text>
      <If when={failure()}>
        <Text class="text-base text-destructive">{failure()}</Text>
      </If>
      <Controls label="测试视频">
        <Button label={paused() ? '播放' : '暂停'} onPress={() => paused.set(!paused())} />
        <Button
          label="跳至 5 秒"
          onPress={() => {
            position.set(5);
            video?.seek(5);
          }}
        />
        <Button
          label="切换视频"
          onPress={() => {
            position.set(0);
            loaded.set(false);
            source.set(source() === 0 ? 1 : 0);
          }}
        />
        <Button
          label={visible() ? '移除画面' : '重建画面'}
          onPress={() => {
            loaded.set(false);
            visible.set(!visible());
          }}
        />
      </Controls>
      <If when={active()}>
        <T0Task onComplete={() => events.update((items) => [...items, 'completed'])} />
      </If>
      <Button label="取消任务" onPress={() => active.set(false)} />
      <Text class="text-base text-muted-foreground">{events().join(',')}</Text>
    </View>
  );
}

mount(App);
