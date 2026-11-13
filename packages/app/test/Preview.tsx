import { Scroll, Text, View, signal, type InputRef, type ViewRef } from 'nsh';
import {
  Button,
  Controls,
  Cover,
  Notice,
  PosterCard,
  Product,
  SearchInput,
  type ProductTarget,
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaControls,
  CinemaText,
  EpisodePanel,
  EpisodeRange,
} from '@hongguo/ui';

/** Internal controls fixture: never mounted by a product entry. */
export function ControlPreview(props: { target: ProductTarget }) {
  const value = signal('');
  const selected = signal(0);
  let input: InputRef | undefined;
  return (
    <Product.Provider value={props.target}>
      <Scroll class="flex-1 bg-background" contentStyle={{ padding: 24, gap: 24 }}>
        <View class="gap-5">
          <Text class="text-3xl font-semibold text-foreground">控件预览</Text>
          <Controls label="主导航预览">
            <Button label="首页" variant="navigation" selected onPress={() => selected.set(0)} />
            <Button label="找剧" variant="navigation" onPress={() => input?.focus()} />
          </Controls>
          <View class="flex-row gap-3">
            <SearchInput
              inputRef={(ref) => {
                input = ref;
              }}
              value={value()}
              onChange={value.set}
              onSubmit={() => selected.set(1)}
            />
            <Button
              label="搜索"
              primary
              disabled={!value().trim()}
              onPress={() => selected.set(1)}
            />
          </View>
          <Controls label="选集区间">
            <Button label="1–24" selected={selected() === 0} onPress={() => selected.set(0)} />
            <Button label="25–48" selected={selected() === 1} onPress={() => selected.set(1)} />
            <Button label="未开放" disabled onPress={() => {}} />
          </Controls>
          <View class="flex-row gap-4">
            <View class="w-40">
              <PosterCard
                testID="preview-poster"
                title="封面加载失败仍可阅读长标题"
                cover="http://127.0.0.1:1/missing.jpg"
                caption="48 集"
                onPress={() => selected.set(1)}
              />
            </View>
            <Cover title="无封面" class="w-24 h-36" />
          </View>
          <Notice message="正在找剧…" />
          <Notice error message="搜索失败，请稍后重试。" retry={() => selected.set(0)} />
        </View>
      </Scroll>
    </Product.Provider>
  );
}

/** Isolated synthetic UI fixture; never implies that media has loaded or played. */
export function PlayerControlPreview(props: { target: ProductTarget }) {
  const position = signal(24);
  const rate = signal('1');
  const panel = signal(false);
  const hidden = signal(false);
  const volume = signal(0.8);
  const committed = signal(24);
  const exits = signal(0);
  let panelTrigger: ViewRef | undefined;
  const closePanel = () => {
    panel.set(false);
    requestAnimationFrame(() => panelTrigger?.focus());
  };
  return (
    <Product.Provider value={props.target}>
      <View class="flex-1 bg-background">
        <View class="p-4 items-start">
          <Button label="控件预览" onPress={() => hidden.update((value) => !value)} />
        </View>
        <View class="flex-1 justify-end bg-cinema relative">
          <CinemaControls visible={!hidden()}>
            <CinemaText variant="title">播放器控件预览</CinemaText>
            <CinemaSlider
              label="播放进度"
              value={position()}
              max={102}
              onChange={position.set}
              onCommit={committed.set}
            />
            <View class="flex-row gap-2 items-center">
              <CinemaButton label="播放" icon="play" onPress={() => position.set(25)} />
              <CinemaButton label="下一集" icon="next" disabled onPress={() => position.set(0)} />
              <CinemaText variant="time">{position()} / 102</CinemaText>
              <View class="flex-1" />
              <CinemaButton
                label="静音"
                icon="volume"
                iconOnly
                selected
                onPress={() => volume.set(0)}
              />
              <View class="w-16">
                <CinemaSlider label="音量" compact value={volume()} max={1} onChange={volume.set} />
              </View>
              <CinemaSelect
                label="播放速度"
                value={rate()}
                items={[
                  { value: '1', title: '1×' },
                  { value: '1.5', title: '1.5×' },
                ]}
                onChange={rate.set}
              />
              <CinemaButton
                label="选集"
                icon="list"
                buttonRef={(ref) => {
                  panelTrigger = ref;
                }}
                onPress={() => panel.set(true)}
              />
              <CinemaButton label="全屏" icon="fullscreen" iconOnly disabled onPress={() => {}} />
            </View>
            <CinemaText variant="preview">定位到 00:24 · 确认键应用，返回键取消</CinemaText>
            <CinemaText>
              提交 {committed()} · 音量 {Math.round(volume() * 100)} · 速度 {rate()}
            </CinemaText>
          </CinemaControls>
        </View>
        <View class="p-4 items-start">
          <Button
            label={`预览结束 ${exits()}`}
            onPress={() => exits.update((value) => value + 1)}
          />
        </View>
        <EpisodePanel open={panel()} onClose={closePanel}>
          <Text class="text-xl font-semibold text-foreground">选集</Text>
          <EpisodeRange
            value={0}
            count={60}
            pageSize={props.target === 'tv' ? 12 : 24}
            onChange={() => {}}
          />
          <View class="flex-row gap-3">
            <Button label="第 1 集" selected episode onPress={closePanel} />
            <Button label="第 2 集 · 未开放" disabled episode onPress={() => {}} />
          </View>
          <Notice error message="播放失败，请重试。" retry={closePanel} />
        </EpisodePanel>
      </View>
    </Product.Provider>
  );
}
