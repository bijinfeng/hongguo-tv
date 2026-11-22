import { Image, View, windowSize, type JSX } from 'nsh';
import {
  Button,
  CardControls,
  CardRoot,
  focusRingClass,
  Icon,
  Notice,
  Progress,
  SkeletonBlock,
  SkeletonRegion,
  Surface,
  UiText,
} from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import type { Store } from '../../store';
import { errorMessage } from '../../error-messages';
import { playbackTime } from '../../format';
import { historyLabel } from '../History';
import { contentGutter } from '../../shell/ContentColumn';

type Entry = Library['entries'][number];

/** Draft rail keeps three equal columns; a single entry must not stretch across the column. */
const continueTileWidth = () =>
  Math.floor((Math.min(1660, windowSize().width - 176) - contentGutter() * 2 - 36) / 3);

/** Continue card: draft rail card on TV (stacked), horizontal row on desktop. */
function ContinueTile(props: { entry: Entry; store: Store }) {
  const entry = () => props.entry;
  const tv = () => props.store.target === 'tv';
  const resume = () => props.store.watch(entry().drama, () => props.store.restoreFocus());
  const openDetail = () => props.store.open(entry().drama, () => props.store.restoreFocus());
  const duration = () => entry().duration;
  const position = () => entry().position ?? 0;
  // A missing duration stays unknown: no bar claims the entry is at the start.
  const known = () => duration() !== undefined && duration()! > 0;
  const remaining = () => {
    if (!known()) return '';
    const left = duration()! - position();
    return left > 0 ? `· 剩余 ${playbackTime(left)}` : '';
  };
  const coverSource = () => entry().drama.cover_fallback || entry().drama.cover;
  const progress = () => (
    <Progress position={position()} duration={duration()} accessibilityLabel="已看进度" />
  );
  const cover = (width: number) => (
    <Image
      src={coverSource()}
      class="object-cover"
      style={{
        objectPosition: 'top',
        width,
        height: width * 0.625,
        borderRadius: 8,
      }}
    />
  );
  /** The card itself is the press target: cover, title, episode and progress all answer. */
  const card = (width: number, content: () => JSX.Element, extra?: () => JSX.Element) => (
    <CardControls label={entry().drama.title} onNavigate={props.store.noteFocusIntent}>
      <CardRoot
        testID={`home-continue-${entry().drama.series_id}`}
        accessibilityLabel={historyLabel(entry())}
        onPress={resume}
        style={{ padding: 0 }}
        class={`flex-1 min-w-0 border border-border rounded-(--radius) bg-card hover:bg-muted active:bg-border ${focusRingClass(4)}`}
      >
        <View class="flex-row items-center" style={{ padding: 10, gap: 15 }}>
          {cover(width)}
          {content()}
        </View>
        {extra?.()}
      </CardRoot>
    </CardControls>
  );
  if (tv()) {
    return (
      <View
        class="border border-border rounded-(--radius) bg-card"
        style={{ width: 163, padding: 5, gap: 6 }}
      >
        <CardControls label={entry().drama.title} onNavigate={props.store.noteFocusIntent}>
          <CardRoot
            testID={`home-continue-${entry().drama.series_id}`}
            accessibilityLabel={historyLabel(entry())}
            onPress={resume}
            style={{ padding: 0, gap: 6 }}
            class={`hover:bg-muted active:bg-border ${focusRingClass(4)}`}
          >
            {cover(153)}
            <UiText role="body" lines={1}>
              {entry().drama.title}
            </UiText>
            <UiText role="meta" lines={1}>
              第 {entry().episode ?? 1} 集{remaining()}
            </UiText>
            <If when={known()}>{progress()}</If>
          </CardRoot>
        </CardControls>
        <View class="items-start">
          <Button label="选集与详情" icon="forward" onPress={openDetail} />
        </View>
      </View>
    );
  }
  return card(114, () => (
    <View class="flex-1 min-w-0" style={{ gap: 8 }}>
      <UiText role="content-title" lines={1}>
        {entry().drama.title}
      </UiText>
      <UiText role="meta" lines={1}>
        第 {entry().episode ?? 1} 集{remaining()}
      </UiText>
      <If when={known()}>{progress()}</If>
    </View>
  ));
}

function ContinueEmpty(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  return (
    <Surface variant="muted" class="flex-row items-center">
      <View
        class="shrink-0 items-center justify-center rounded-full bg-accent"
        style={{ width: tv() ? 32 : 44, height: tv() ? 32 : 44 }}
      >
        <Icon name="search" />
      </View>
      <View class="min-w-0 flex-1" style={{ gap: tv() ? 2 : 4 }}>
        <UiText role="title">还没有观看记录</UiText>
        <UiText role="body" tone="muted" lines={2}>
          挑一部剧，之后可以从这里接着看。
        </UiText>
      </View>
      <Button
        label="去找剧"
        icon="search"
        variant="primary"
        size={tv() ? 'md' : 'sm'}
        testID="home-continue-discover"
        onPress={() => {
          props.store.navigate('discover');
          props.store.restoreFocus();
        }}
      />
    </Surface>
  );
}

/** Pending rail: the same card, cover and copy rows as a loaded tile, no motion. */
function ContinueSkeleton(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const count = () => (tv() ? 4 : 3);
  return (
    <SkeletonRegion
      label="正在加载观看记录"
      testID="home-continue-pending"
      class="flex-row"
      style={{ gap: tv() ? 14 : 18 }}
    >
      <Each
        of={Array.from({ length: count() }, (_, index) => index)}
        key={(index: number) => index}
      >
        {() =>
          tv() ? (
            <View
              class="border border-border rounded-(--radius) bg-card"
              style={{ width: 163, padding: 5, gap: 6 }}
            >
              <SkeletonBlock width={153} height={153 * 0.625} radius={8} />
              <View class="justify-center" style={{ height: 16.5 }}>
                <SkeletonBlock width="72%" height={11} radius={4} />
              </View>
              <View class="justify-center" style={{ height: 15 }}>
                <SkeletonBlock width="46%" height={10} radius={4} />
              </View>
              <SkeletonBlock width="100%" height={2} radius={1} />
              <SkeletonBlock width={84} height={24} radius={6} />
            </View>
          ) : (
            <View style={{ width: continueTileWidth() }}>
              <View
                class="flex-row items-center border border-border rounded-(--radius) bg-card"
                style={{ padding: 10, gap: 15 }}
              >
                <SkeletonBlock width={114} height={114 * 0.625} radius={8} />
                <View class="flex-1 min-w-0" style={{ gap: 8 }}>
                  <View class="justify-center" style={{ height: 27 }}>
                    <SkeletonBlock width="64%" height={14} radius={4} />
                  </View>
                  <View class="justify-center" style={{ height: 21 }}>
                    <SkeletonBlock width="42%" height={12} radius={4} />
                  </View>
                  <SkeletonBlock width="100%" height={2} radius={1} />
                </View>
              </View>
            </View>
          )
        }
      </Each>
    </SkeletonRegion>
  );
}

/** A failed, still-empty library: say what failed and keep the retry in place. */
function ContinueFailure(props: { store: Store }) {
  const library = props.store.library;
  return (
    <Notice
      title="观看记录加载失败"
      message={errorMessage(library.error(), '记录加载失败')}
      error
      retry={() => library.refetch()}
      testID="home-continue-retry"
    />
  );
}

/** “继续观看” rail with the library link, from the home draft. */
export function ContinueSection(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const entries = () => props.store.entries().slice(0, tv() ? 4 : 3);
  const library = props.store.library;
  const state = () => library.state();
  const pending = () => state() === 'unresolved' || state() === 'pending';
  return (
    <View>
      <View class="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
        <UiText role={tv() ? 'section' : 'title'}>{tv() ? '接着上次的故事' : '继续观看'}</UiText>
        <Button
          label="全部记录"
          icon="forward"
          variant="quiet"
          compact
          onPress={() => {
            props.store.openLibrary('history');
            props.store.restoreFocus();
          }}
        />
      </View>
      <If when={entries().length > 0}>
        <View class="flex-row" style={{ gap: tv() ? 14 : 18 }}>
          <Each of={entries()} key={(entry: Entry) => entry.drama.series_id}>
            {(entry) =>
              tv() ? (
                <ContinueTile entry={entry()} store={props.store} />
              ) : (
                <View style={{ width: continueTileWidth() }}>
                  <ContinueTile entry={entry()} store={props.store} />
                </View>
              )
            }
          </Each>
        </View>
      </If>
      <If when={entries().length === 0 && pending()}>
        <ContinueSkeleton store={props.store} />
      </If>
      <If when={entries().length === 0 && state() === 'errored'}>
        <ContinueFailure store={props.store} />
      </If>
      <If when={entries().length === 0 && !pending() && state() !== 'errored'}>
        <ContinueEmpty store={props.store} />
      </If>
    </View>
  );
}
