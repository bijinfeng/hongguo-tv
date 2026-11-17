import { Image, View, windowSize } from 'nsh';
import { Button, CardControls, Icon, Surface, UiText, tvUnit } from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import type { Store } from '../../store';
import { historyLabel } from '../History';
import { contentGutter } from '../../shell/ContentColumn';

type Entry = Library['entries'][number];

const clock = (seconds: number) => {
  const safe = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

/** Continue card: draft rail card on TV (stacked), horizontal row on desktop. */
function ContinueTile(props: { entry: Entry; store: Store }) {
  const entry = () => props.entry;
  const tv = () => props.store.target === 'tv';
  const resume = () => props.store.watch(entry().drama, () => props.store.restoreFocus());
  const openDetail = () => props.store.open(entry().drama, () => props.store.restoreFocus());
  const duration = () => entry().duration ?? 0;
  const position = () => entry().position ?? 0;
  const ratio = () => (duration() > 0 ? Math.min(1, Math.max(0, position() / duration())) : 0);
  const remaining = () => {
    const left = duration() - position();
    return duration() > 0 && left > 0 ? `· 剩余 ${clock(left)}` : '';
  };
  const cover = () => entry().drama.cover_fallback || entry().drama.cover;
  const progress = () => (
    <View class="w-full overflow-hidden bg-border" style={{ height: 2 }}>
      <View class="h-full bg-primary" style={{ width: `${Math.round(ratio() * 100)}%` }} />
    </View>
  );
  const coverButton = (width: number) => (
    <CardControls label={entry().drama.title} onNavigate={props.store.noteFocusIntent}>
      <Button
        testID={`home-continue-${entry().drama.series_id}`}
        variant="quiet"
        artwork={
          <Image
            src={cover()}
            class="object-cover"
            style={{
              objectPosition: 'top',
              width,
              height: width * 0.625,
              borderRadius: 8,
            }}
          />
        }
        displayLabel=""
        label={historyLabel(entry())}
        style={{ padding: 0 }}
        onPress={resume}
      />
    </CardControls>
  );
  if (tv()) {
    return (
      <View
        class="border border-border rounded-(--radius) bg-card"
        style={{ width: tvUnit(326), padding: tvUnit(10), gap: tvUnit(12) }}
      >
        {coverButton(tvUnit(306))}
        <UiText role="body" lines={1}>
          {entry().drama.title}
        </UiText>
        <UiText role="meta" lines={1}>
          第 {entry().episode ?? 1} 集{remaining()}
        </UiText>
        {progress()}
        <View class="items-start">
          <Button label="选集与详情" icon="forward" onPress={openDetail} />
        </View>
      </View>
    );
  }
  return (
    <View
      class="flex-1 min-w-0 flex-row items-center border border-border rounded-(--radius) bg-card"
      style={{ padding: 10, gap: 15 }}
    >
      {coverButton(114)}
      <View class="flex-1 min-w-0" style={{ gap: 8 }}>
        <UiText role="content-title" lines={1}>
          {entry().drama.title}
        </UiText>
        <UiText role="meta" lines={1}>
          第 {entry().episode ?? 1} 集{remaining()}
        </UiText>
        {progress()}
      </View>
    </View>
  );
}

function ContinueEmpty(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  return (
    <Surface variant="muted" class="flex-row items-center">
      <View
        class="shrink-0 items-center justify-center rounded-full bg-accent"
        style={{ width: tv() ? tvUnit(64) : 44, height: tv() ? tvUnit(64) : 44 }}
      >
        <Icon name="search" />
      </View>
      <View class="min-w-0 flex-1" style={{ gap: tv() ? tvUnit(4) : 4 }}>
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

/** “继续观看” rail with the library link, from the home draft. */
export function ContinueSection(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const entries = () => props.store.entries().slice(0, tv() ? 4 : 3);
  // Draft rail keeps three equal columns; a single entry must not stretch across the column.
  const tileWidth = () =>
    Math.floor((Math.min(1660, windowSize().width - 176) - contentGutter() * 2 - 36) / 3);
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
      <If when={entries().length} else={<ContinueEmpty store={props.store} />}>
        <View class="flex-row" style={{ gap: tv() ? tvUnit(28) : 18 }}>
          <Each of={entries()} key={(entry: Entry) => entry.drama.series_id}>
            {(entry) =>
              tv() ? (
                <ContinueTile entry={entry()} store={props.store} />
              ) : (
                <View style={{ width: tileWidth() }}>
                  <ContinueTile entry={entry()} store={props.store} />
                </View>
              )
            }
          </Each>
        </View>
      </If>
    </View>
  );
}
