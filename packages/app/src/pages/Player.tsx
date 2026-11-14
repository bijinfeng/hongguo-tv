import {
  Video,
  Scroll,
  Text,
  View,
  signal,
  cleanup,
  effect,
  lifecycle,
  keymap,
  untracked,
  windowSize,
  type VideoRef,
  type ViewRef,
} from 'nsh';
import { currentWindow, isAvailable, type WindowMode } from 'nsh/desktop';
import { CoreError, play, type Drama, type Episode } from '@hongguo/core-client';
import { type Store } from '../store';
import { playbackLease, progressSession } from '../playback';
import {
  Button,
  Notice,
  Controls,
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaControls,
  CinemaText,
  CinemaStageAction,
  CinemaSettingRow,
  EpisodePanel,
  EpisodeRail,
  EpisodeRange,
  tvUnit,
} from '@hongguo/ui';

type Media = Awaited<ReturnType<typeof play>>;
type Representation = { info: Media; revision: number };
type TvLayer = 'hidden' | 'controls' | 'seek-preview' | 'episode-panel';
const timeLabel = (value: number) => {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

function Episodes(props: {
  drama: Drama;
  current: Episode;
  target: 'desktop' | 'tv';
  onSelect: (episode: Episode) => void;
}) {
  const size = props.target === 'tv' ? 12 : 24;
  const episodes = () => props.drama.episodes ?? [];
  const initial = episodes().findIndex((episode) => episode.video_id === props.current.video_id);
  const segment = signal(Math.max(0, Math.floor(initial / size)));
  return (
    <View class="flex-1 gap-5">
      <EpisodeRange
        value={segment()}
        count={episodes().length}
        pageSize={size}
        onChange={segment.set}
      />
      <Scroll class="flex-1" contentStyle={{ width: '100%', paddingBottom: 12 }}>
        <View class="flex-row flex-wrap" style={{ rowGap: props.target === 'tv' ? tvUnit(16) : 8 }}>
          <Each
            of={episodes().slice(segment() * size, (segment() + 1) * size)}
            key={(episode) => episode.video_id}
          >
            {(episode) => (
              <View style={{ width: '25%', paddingRight: props.target === 'tv' ? tvUnit(16) : 8 }}>
                <Button
                  testID={`player-episode-${episode().video_id}`}
                  episode="player"
                  label={`第 ${episode().index} 集${episode().locked ? ' · 未开放' : ''}`}
                  displayLabel={
                    props.target === 'tv'
                      ? `第 ${episode().index} 集`
                      : String(episode().index).padStart(2, '0')
                  }
                  icon={episode().locked ? 'lock' : undefined}
                  disabled={episode().locked}
                  selected={episode().video_id === props.current.video_id}
                  onPress={() => props.onSelect(episode())}
                />
              </View>
            )}
          </Each>
        </View>
      </Scroll>
    </View>
  );
}

/** One keyed representation; callbacks retain their owner even after a new source wins. */
function MediaView(props: {
  representation: Representation;
  paused: boolean;
  volume: number;
  rate: number;
  current: (revision: number) => boolean;
  onRef: (value: VideoRef) => void;
  onLoad: (duration: number) => void;
  onProgress: (position: number, duration: number) => void;
  onBuffer: (value: boolean) => void;
  onError: () => void;
  onEnd: () => void;
}) {
  const revision = props.representation.revision;
  return (
    <Video
      testID="player-video"
      src={props.representation.info.url}
      ref={props.onRef}
      paused={props.paused}
      volume={props.volume}
      rate={props.rate}
      controls={false}
      progressUpdateInterval={1000}
      class="absolute inset-0"
      style={{ objectFit: 'contain' }}
      onLoad={({ duration }) => {
        if (props.current(revision)) props.onLoad(duration);
      }}
      onProgress={({ currentTime, duration }) => {
        if (props.current(revision)) props.onProgress(currentTime, duration);
      }}
      onBuffer={({ isBuffering }) => {
        if (props.current(revision)) props.onBuffer(isBuffering);
      }}
      onError={() => {
        if (props.current(revision)) props.onError();
      }}
      onEnd={() => {
        if (props.current(revision)) props.onEnd();
      }}
    />
  );
}

export type PlayerCheckpoint = { position: number; paused: boolean };
export function Player(props: {
  drama: Drama;
  episode: Episode;
  store: Store;
  active?: boolean;
  /** Feed owns story/episode navigation; media and progress still belong to this player. */
  feed?: {
    checkpoint?: PlayerCheckpoint;
    onCheckpoint: (checkpoint: PlayerCheckpoint) => void;
    onEpisode: (episode: Episode) => void;
    onLeave: () => void;
    onNext: () => void;
    nextLabel: string;
    nextDisabled: boolean;
    nextRef: (ref: ViewRef) => void;
  };
}) {
  const tv = props.store.target === 'tv';
  const media = signal<Representation | undefined>(undefined);
  const preparing = signal(true);
  const loaded = signal(false);
  const paused = signal(props.feed?.checkpoint?.paused ?? false);
  const completed = signal(false);
  const position = signal(0);
  const duration = signal(0);
  const error = signal('');
  const buffering = signal(false);
  const quality = signal('');
  const qualities = signal<string[]>([]);
  const volume = signal(0.8);
  const rate = signal('1');
  const panel = signal(false);
  const more = signal(false);
  const menuOpen = signal(false);
  const layer = signal<TvLayer>('controls');
  const preview = signal<number | undefined>(undefined);
  const keyboardEngaged = signal(!!props.feed);
  const interaction = signal(0);
  const window = isAvailable ? currentWindow() : undefined;
  const fullScreen = () => window?.state()?.placement.mode === 'fullScreen';
  let previousMode: WindowMode = 'normal';
  let video: VideoRef | undefined;
  let playRef: ViewRef | undefined;
  let panelRef: ViewRef | undefined;
  let moreRef: ViewRef | undefined;
  let stageRef: ViewRef | undefined;
  let restorePosition = props.feed?.checkpoint?.position ?? 0;
  let seekingTo: number | undefined;
  let hadBackground = false;
  let firstLoad = true;
  let savedVolume = 0.8;
  const session = progressSession((time, total, finished) => {
    void props.store.save(props.drama, props.episode, time, total, finished);
  });
  const checkpoint = () => {
    session.save();
    props.feed?.onCheckpoint({
      position: loaded() ? position() : restorePosition,
      paused: paused(),
    });
  };
  const lease = playbackLease<Media>({
    pending() {
      video = undefined;
      media.set(undefined);
      preparing.set(true);
      loaded.set(false);
      buffering.set(false);
      error.set('');
    },
    ready(info, revision) {
      media.set({ info, revision });
      qualities.set(info.qualities ?? []);
      preparing.set(false);
      buffering.set(true);
    },
    failed(reason) {
      preparing.set(false);
      error.set(
        reason instanceof CoreError && reason.status === 501
          ? '当前服务暂不支持播放，请稍后重试。'
          : reason instanceof Error
            ? reason.message
            : '暂时无法播放，请重试。',
      );
      layer.set('controls');
    },
    release(info) {
      void info
        .release()
        .catch(() =>
          console.warn('Playback resource release failed; core idle expiry remains active'),
        );
    },
  });
  const enabled = () => loaded() && !error() && !preparing();
  const active = () => props.active !== false;
  const refresh = () => {
    checkpoint();
    if (!firstLoad) restorePosition = position();
    preview.set(undefined);
    void lease.prepare((abort) => play(props.drama, props.episode, abort, { quality: quality() }));
  };
  const seek = (value: number) => {
    if (!enabled() || !Number.isFinite(value)) return;
    const next = Math.min(duration(), Math.max(0, value));
    session.seed(next, duration());
    seekingTo = next;
    position.set(next);
    preview.set(undefined);
    video?.seek(next);
    interaction.update((value) => value + 1);
  };
  const next = () =>
    props.drama.episodes?.find(
      (episode) => episode.index === props.episode.index + 1 && !episode.locked,
    );
  const selectEpisode = (episode: Episode) => {
    if (episode.locked) return;
    if (episode.video_id === props.episode.video_id) {
      closePanel();
      return;
    }
    checkpoint();
    if (props.feed) props.feed.onEpisode(episode);
    else props.store.nav.replace({ name: 'player', drama: props.drama, episode });
  };
  const nextEpisode = () => {
    const episode = next();
    if (episode) selectEpisode(episode);
  };
  const toggle = () => {
    if (!enabled()) return;
    if (completed()) {
      session.restart();
      seek(0);
      completed.set(false);
    }
    paused.update((value) => !value);
    if (paused()) checkpoint();
    interaction.update((value) => value + 1);
  };
  const closePanel = () => {
    panel.set(false);
    layer.set('controls');
    keyboardEngaged.set(true);
    requestAnimationFrame(() => panelRef?.focus());
  };
  const showControls = () => {
    layer.set('controls');
    keyboardEngaged.set(true);
    requestAnimationFrame(() => (enabled() ? playRef : panelRef)?.focus());
  };
  const closeMore = () => {
    more.set(false);
    keyboardEngaged.set(true);
    requestAnimationFrame(() => moreRef?.focus());
  };
  const hideControls = () => {
    layer.set('hidden');
    keyboardEngaged.set(false);
    requestAnimationFrame(() => stageRef?.focus());
  };
  const leave = () => {
    checkpoint();
    if (fullScreen()) window?.setMode(previousMode);
    if (props.feed) props.feed.onLeave();
    else props.store.nav.pop();
  };
  const back = () => {
    if (panel()) {
      closePanel();
      return;
    }
    if (more()) {
      closeMore();
      return;
    }
    if (tv && layer() === 'seek-preview') {
      preview.set(undefined);
      hideControls();
      return;
    }
    if (tv && layer() === 'controls') {
      hideControls();
      return;
    }
    if (fullScreen()) {
      window?.setMode(previousMode);
      return;
    }
    leave();
  };
  effect(() => {
    if (active()) return props.store.registerPlayerBack(back);
  });
  effect(() => {
    if (active()) return props.store.registerPlayerCheckpoint(checkpoint);
  });
  const previewSeek = (delta: number) => {
    if (!enabled()) {
      showControls();
      return;
    }
    preview.set(Math.min(duration(), Math.max(0, (preview() ?? position()) + delta)));
    layer.set('seek-preview');
  };
  const confirmPreview = () => {
    if (preview() !== undefined) seek(preview()!);
    showControls();
  };
  effect(() => {
    if (!active()) return;
    return props.store.registerPlayerCommand((command) => {
      if (!active() || lifecycle() !== 'active' || panel() || more() || menuOpen()) return;
      if (command === 'reveal') showControls();
      else if (command === 'preview-back') previewSeek(-10);
      else if (command === 'preview-forward') previewSeek(10);
      else if (command === 'confirm') confirmPreview();
      else if (command === 'toggle') {
        toggle();
        if (paused()) showControls();
      } else if (command === 'play' && (paused() || completed())) toggle();
      else if (command === 'pause') {
        if (!paused()) toggle();
        showControls();
      } else if (command === 'next') nextEpisode();
      else if (command === 'seek-back') seek(position() - 10);
      else if (command === 'seek-forward') seek(position() + 10);
    });
  });
  const fullscreen = () => {
    if (!window) return;
    if (fullScreen()) window.setMode(previousMode);
    else {
      previousMode = window.state()?.placement.mode ?? 'normal';
      window.setMode('fullScreen');
    }
    keyboardEngaged.set(true);
  };
  effect(() => {
    const foreground = lifecycle() === 'active' && active();
    untracked(() => {
      if (!foreground) {
        paused.set(true);
        checkpoint();
        if (lifecycle() === 'background' || !active()) {
          hadBackground = true;
          restorePosition = position();
          lease.stop();
          media.set(undefined);
          loaded.set(false);
          preparing.set(false);
        }
      } else if (firstLoad || hadBackground) {
        hadBackground = false;
        refresh();
        firstLoad = false;
      }
    });
  });
  effect(() => {
    if (
      !tv ||
      !active() ||
      layer() !== 'controls' ||
      paused() ||
      !enabled() ||
      buffering() ||
      panel() ||
      more() ||
      menuOpen() ||
      preview() !== undefined ||
      keyboardEngaged()
    )
      return;
    interaction();
    const timer = setTimeout(hideControls, 4000);
    return () => clearTimeout(timer);
  });
  effect(() => {
    if (!active() || panel() || more() || menuOpen()) return;
    const removers = [
      keymap.bind('tab', () => keyboardEngaged.set(true), {
        when: 'notEditing',
        passThrough: true,
      }),
    ];
    // Focused sliders, selects and buttons own their arrows and Space after keyboard navigation.
    if (!keyboardEngaged()) {
      removers.push(keymap.bind('space', toggle, { when: 'notEditing' }));
    }
    if (!tv && !keyboardEngaged()) {
      removers.push(
        keymap.bind('left', () => seek(position() - 10), { when: 'notEditing', repeat: true }),
      );
      removers.push(
        keymap.bind('right', () => seek(position() + 10), { when: 'notEditing', repeat: true }),
      );
    }
    return () => removers.forEach((remove) => remove());
  });
  effect(() => {
    if (
      !tv ||
      !active() ||
      panel() ||
      more() ||
      menuOpen() ||
      (layer() !== 'hidden' && layer() !== 'seek-preview')
    )
      return;
    const removers = [
      keymap.bind('left', () => previewSeek(-10), { when: 'notEditing', repeat: true }),
      keymap.bind('right', () => previewSeek(10), { when: 'notEditing', repeat: true }),
      keymap.bind('enter', confirmPreview, { when: 'notEditing' }),
    ];
    return () => removers.forEach((remove) => remove());
  });
  cleanup(() => {
    checkpoint();
    lease.dispose();
    if (fullScreen()) window?.setMode(previousMode);
  });

  return (
    <View testID="player" class={tv ? 'flex-1 bg-cinema' : 'flex-1'}>
      <If when={!tv && !fullScreen() && !props.feed}>
        <View class="px-10 pt-6 pb-5 gap-4 items-start">
          <Button label="返回" variant="quiet" compact icon="back" onPress={leave} />
          <Text class="text-2xl font-semibold text-foreground">
            {props.drama.title} · 第 {props.episode.index} 集
          </Text>
        </View>
      </If>
      <Scroll
        class="flex-1"
        contentStyle={{
          width: '100%',
          flexGrow: 1,
          paddingHorizontal: tv || fullScreen() || props.feed ? 0 : 40,
          paddingBottom: tv || fullScreen() || props.feed ? 0 : 40,
        }}
      >
        <View class="flex-1 flex-row gap-6 items-start">
          <View class="flex-1 min-w-0" style={{ height: tv ? '100%' : undefined }}>
            <View
              class={
                tv
                  ? 'flex-1 relative bg-cinema overflow-hidden'
                  : 'relative bg-cinema rounded-(--radius) overflow-hidden'
              }
              style={{ height: tv ? '100%' : undefined }}
            >
              <View
                class="relative bg-cinema"
                style={{
                  height: tv
                    ? windowSize().height
                    : fullScreen()
                      ? Math.max(0, windowSize().height - 96)
                      : props.feed
                        ? 520
                        : 456,
                }}
              >
                <Each of={media() ? [media()!] : []} key={(value) => value.revision}>
                  {(value) => (
                    <MediaView
                      representation={value()}
                      paused={paused() || !active() || !!error()}
                      volume={volume()}
                      rate={Number(rate())}
                      current={lease.current}
                      onRef={(ref) => {
                        video = ref;
                      }}
                      onLoad={(total) => {
                        duration.set(total);
                        loaded.set(true);
                        buffering.set(false);
                        const resume = props.store.resume(props.drama);
                        const saved =
                          resume?.video_id === props.episode.video_id && !resume.completed
                            ? (resume.position ?? 0)
                            : 0;
                        const start =
                          restorePosition > 0 && total > 0
                            ? Math.min(restorePosition, total)
                            : saved > 0 && total > 3 && saved < total - 3
                              ? saved
                              : 0;
                        session.seed(start, total);
                        position.set(start);
                        seekingTo = start > 0 ? start : undefined;
                        if (start > 0) {
                          const owner = media()?.revision;
                          // Apply restoration after the host's initial source and pause props settle.
                          requestAnimationFrame(() => {
                            if (
                              owner !== undefined &&
                              lease.current(owner) &&
                              seekingTo !== undefined
                            )
                              video?.seek(seekingTo);
                          });
                        }
                        restorePosition = 0;
                      }}
                      onProgress={(time, total) => {
                        if (completed() || error() || !loaded() || !active()) return;
                        if (seekingTo !== undefined) {
                          if (Math.abs(time - seekingTo) > Math.max(1, Number(rate()) + 0.5))
                            return;
                          seekingTo = undefined;
                          session.seed(time, total);
                          position.set(time);
                          duration.set(total);
                          return;
                        }
                        position.set(time);
                        duration.set(total);
                        session.update(time, total, !paused() && !buffering() && loaded());
                      }}
                      onBuffer={(value) => buffering.set(value)}
                      onError={() => {
                        error.set('播放失败，请重试。');
                        buffering.set(false);
                        paused.set(true);
                        layer.set('controls');
                      }}
                      onEnd={() => {
                        if (completed() || error() || !loaded() || !active()) return;
                        session.end();
                        completed.set(true);
                        paused.set(true);
                        layer.set('controls');
                        if (next()) nextEpisode();
                      }}
                    />
                  )}
                </Each>
                <CinemaStageAction
                  label={
                    tv
                      ? layer() === 'seek-preview'
                        ? '确认播放位置'
                        : '显示播放控制'
                      : paused()
                        ? '播放画面'
                        : '暂停画面'
                  }
                  showPlay={!tv && paused() && !buffering() && !completed() && !error()}
                  disabled={tv ? layer() !== 'hidden' && layer() !== 'seek-preview' : !enabled()}
                  buttonRef={(ref) => {
                    stageRef = ref;
                  }}
                  onPress={
                    tv ? (layer() === 'seek-preview' ? confirmPreview : showControls) : toggle
                  }
                />
                <If when={preparing() || buffering() || error() || completed()}>
                  <View class="absolute inset-0 items-center justify-center bg-cinema/80 gap-4 p-5">
                    <CinemaText variant="title">
                      {error()
                        ? '播放遇到问题'
                        : completed()
                          ? '本集已播完'
                          : preparing()
                            ? '正在准备播放…'
                            : '正在缓冲…'}
                    </CinemaText>
                    <If when={error()}>
                      <CinemaText>{error()}</CinemaText>
                      <Controls label="播放恢复">
                        <CinemaButton label="重试" onPress={refresh} />
                        <CinemaButton label="返回" icon="back" onPress={leave} />
                      </Controls>
                    </If>
                    <If when={completed() && !next()}>
                      <CinemaButton label="重新播放" icon="play" onPress={toggle} />
                    </If>
                  </View>
                </If>
              </View>
              <CinemaControls visible={!tv || layer() !== 'hidden'}>
                <If when={tv}>
                  <View class="flex-row items-center justify-between">
                    <View class="gap-2">
                      <CinemaText variant="title">
                        {props.drama.title} · 第 {props.episode.index} 集
                      </CinemaText>
                      <CinemaText>
                        第 {props.episode.index} 集 / 共{' '}
                        {props.drama.episode_count ?? props.drama.episodes?.length ?? 0} 集
                      </CinemaText>
                    </View>
                    <CinemaButton label="返回" icon="back" onPress={leave} />
                  </View>
                </If>
                <If when={layer() === 'seek-preview'}>
                  <CinemaText variant="preview">
                    定位到 {timeLabel(preview() ?? position())} · 确认键应用，返回键取消
                  </CinemaText>
                </If>
                <View class="flex-row items-center" style={{ gap: tv ? tvUnit(28) : 0 }}>
                  <CinemaSlider
                    label="播放进度"
                    value={preview() ?? position()}
                    max={duration()}
                    disabled={!enabled()}
                    onChange={(value) => {
                      preview.set(value);
                      interaction.update((value) => value + 1);
                    }}
                    onCommit={seek}
                  />
                  <If when={tv}>
                    <CinemaText>
                      {timeLabel(preview() ?? position())} / {timeLabel(duration())}
                    </CinemaText>
                  </If>
                </View>
                <View class="flex-row items-center" style={{ gap: tv ? tvUnit(16) : 6 }}>
                  <CinemaButton
                    label={paused() || !enabled() ? '播放' : '暂停'}
                    icon={paused() || !enabled() ? 'play' : 'pause'}
                    iconOnly={!tv}
                    disabled={!enabled()}
                    buttonRef={(ref) => {
                      playRef = ref;
                    }}
                    onPress={toggle}
                  />
                  <If when={tv}>
                    <CinemaButton
                      label="后退 10 秒"
                      icon="back"
                      disabled={!enabled()}
                      onPress={() => seek(position() - 10)}
                    />
                    <CinemaButton
                      label="前进 10 秒"
                      icon="forward"
                      disabled={!enabled()}
                      onPress={() => seek(position() + 10)}
                    />
                  </If>
                  <CinemaButton
                    label="下一集"
                    icon="next"
                    iconOnly={!tv}
                    disabled={!next()}
                    onPress={nextEpisode}
                  />
                  <If when={!tv}>
                    <CinemaText>
                      {timeLabel(preview() ?? position())} / {timeLabel(duration())}
                    </CinemaText>
                  </If>
                  <View class="flex-1" />
                  <If when={!tv}>
                    <CinemaButton
                      label={volume() ? '静音' : '取消静音'}
                      icon={volume() ? 'volume' : 'mute'}
                      iconOnly
                      disabled={!enabled()}
                      onPress={() => {
                        if (volume()) {
                          savedVolume = volume();
                          volume.set(0);
                        } else volume.set(savedVolume || 0.8);
                      }}
                    />
                    <View class="w-[54px]">
                      <CinemaSlider
                        label="音量"
                        compact
                        value={volume()}
                        max={1}
                        disabled={!enabled()}
                        onChange={volume.set}
                      />
                    </View>
                    <CinemaSelect
                      label="播放速度"
                      value={rate()}
                      items={[0.75, 1, 1.25, 1.5, 2].map((value) => ({
                        value: String(value),
                        title: `${value}×`,
                      }))}
                      disabled={!enabled()}
                      onChange={rate.set}
                      onOpenChange={menuOpen.set}
                    />
                    <CinemaSelect
                      label="清晰度"
                      value={quality()}
                      items={[
                        { value: '', title: '自动' },
                        ...qualities().map((value) => ({ value, title: value })),
                      ]}
                      disabled={!enabled()}
                      onChange={(value) => {
                        quality.set(value);
                        refresh();
                      }}
                      onOpenChange={menuOpen.set}
                    />
                  </If>
                  <If when={tv || fullScreen()}>
                    <CinemaButton
                      label="选集"
                      icon="list"
                      buttonRef={(ref) => {
                        panelRef = ref;
                      }}
                      onPress={() => {
                        panel.set(true);
                        layer.set('episode-panel');
                      }}
                    />
                    <CinemaButton label="评论" disabled onPress={() => {}} />
                  </If>
                  <If when={tv}>
                    <CinemaButton
                      label="更多"
                      icon="settings"
                      buttonRef={(ref) => {
                        moreRef = ref;
                      }}
                      onPress={() => more.set(true)}
                    />
                  </If>
                  <If when={!tv}>
                    <CinemaButton
                      label={fullScreen() ? '退出全屏' : '全屏'}
                      icon="fullscreen"
                      iconOnly
                      disabled={!window}
                      onPress={fullscreen}
                    />
                  </If>
                </View>
              </CinemaControls>
            </View>
            <If when={!tv && !fullScreen()}>
              <View class="flex-row items-center gap-3 pt-4 flex-wrap">
                <If when={props.feed}>
                  <View class="gap-1 flex-1 min-w-0">
                    <Text class="text-xl font-semibold text-foreground line-clamp-1">
                      {props.drama.title}
                    </Text>
                    <Text class="text-sm text-muted-foreground">第 {props.episode.index} 集</Text>
                  </View>
                </If>
                <Button label="收藏" disabled onPress={() => {}} />
                <Button label="点赞" disabled onPress={() => {}} />
                <Button label="追更" disabled onPress={() => {}} />
                <If when={props.feed}>
                  <Button
                    testID="feed-next"
                    label={props.feed!.nextLabel}
                    icon="next"
                    disabled={props.feed!.nextDisabled}
                    buttonRef={props.feed!.nextRef}
                    onPress={() => props.feed?.onNext()}
                  />
                </If>
              </View>
            </If>
            <If when={props.store.warning()}>
              <Notice error message={props.store.warning()} retry={session.retry} />
            </If>
          </View>
          <If when={!tv && !fullScreen()}>
            <EpisodeRail>
              <View class="p-5 gap-5 flex-1">
                <Controls label="播放上下文">
                  <Button label="选集" selected compact onPress={() => {}} />
                  <Button label="评论" compact disabled onPress={() => {}} />
                </Controls>
                <Text class="text-lg font-semibold text-foreground">{props.drama.title}</Text>
                <Episodes
                  drama={props.drama}
                  current={props.episode}
                  target={props.store.target}
                  onSelect={selectEpisode}
                />
              </View>
            </EpisodeRail>
          </If>
        </View>
      </Scroll>
      <EpisodePanel open={panel()} onClose={closePanel}>
        <View class="flex-row items-center justify-between">
          <Text class="text-xl font-semibold text-foreground">选集</Text>
          <Button label="关闭选集" icon="close" iconOnly compact onPress={closePanel} />
        </View>
        <Episodes
          drama={props.drama}
          current={props.episode}
          target={props.store.target}
          onSelect={selectEpisode}
        />
      </EpisodePanel>
      <EpisodePanel open={more()} onClose={closeMore} cinema>
        <View class="flex-row items-center justify-between">
          <CinemaText variant="title">播放设置</CinemaText>
          <CinemaButton label="关闭播放设置" icon="close" iconOnly onPress={closeMore} />
        </View>
        <CinemaSettingRow label="倍速">
          <CinemaSelect
            label="播放速度"
            value={rate()}
            items={[0.75, 1, 1.25, 1.5, 2].map((value) => ({
              value: String(value),
              title: `${value}×`,
            }))}
            disabled={!enabled()}
            onChange={rate.set}
          />
        </CinemaSettingRow>
        <CinemaSettingRow label="清晰度">
          <CinemaSelect
            label="清晰度"
            value={quality()}
            items={[
              { value: '', title: '自动' },
              ...qualities().map((value) => ({ value, title: value })),
            ]}
            disabled={!enabled()}
            onChange={(value) => {
              quality.set(value);
              closeMore();
              refresh();
            }}
          />
        </CinemaSettingRow>
        <CinemaSettingRow label="音量">
          <CinemaSlider
            label="音量"
            compact
            value={volume()}
            max={1}
            disabled={!enabled()}
            onChange={volume.set}
          />
        </CinemaSettingRow>
      </EpisodePanel>
    </View>
  );
}
