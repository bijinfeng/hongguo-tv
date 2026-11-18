import { View, cleanup, effect, platform, signal, untracked, windowSize, type ViewRef } from 'nsh';
import {
  Button,
  ContentArrival,
  Notice,
  Tabs,
  UiText,
  controlMetrics,
  type ProductTarget,
} from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import type { RankingsController } from '../rankings';
import type { RadarController } from '../radar';
import { Radar } from './Radar';
import { desktopContentFrame } from '../shell/ContentColumn';
import { RankingsHero, RankingsHeroSkeleton } from './rankings/RankingsHero';
import { RankingsPending, RankingsList } from './rankings/RankingsList';
import { RankingsToolbar, RankingsToolbarSkeleton } from './rankings/RankingsToolbar';

export type RankingsProps = {
  rankings: RankingsController;
  radar?: RadarController;
  view?: 'official' | 'radar';
  onView?: (view: 'official' | 'radar') => void;
  target: ProductTarget;
  active: boolean;
  onOpen: (drama: Drama, restore: () => void) => void;
  onActor: (id: string, title: string, restore: () => void) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  onPrimary: (ref: ViewRef) => void;
};

type OfficialProps = Omit<RankingsProps, 'radar' | 'view' | 'onView'> & {
  /** The draft hero needs vertical room; short windows keep the plain page heading instead. */
  hero: boolean;
};

function OfficialRankings(props: OfficialProps) {
  const availableHeight = signal(0);
  const selectorHeights = signal<Record<string, number>>({});
  const filterGap = () => (props.target === 'tv' ? 2 : 4);
  /** The row already includes its chip padding: 8 keeps three rows inside the 192 budget. */
  const selectorHeight = () =>
    Math.max(
      controlMetrics('sm').height,
      ...props.rankings.groups().map((group) => selectorHeights()[group.id] ?? 0),
    ) + (props.target === 'tv' ? 4 : 8);
  const measureSelector = (id: string, height: number) => {
    const prior = selectorHeights();
    if (prior[id] === height) return;
    selectorHeights.set(
      Object.fromEntries(
        props.rankings
          .groups()
          .map((group) => [group.id, group.id === id ? height : (prior[group.id] ?? 0)]),
      ),
    );
  };
  const filterHeight = () => {
    const count = props.rankings.groups().length;
    if (!count) return 0;
    const row = selectorHeight();
    const gap = filterGap();
    const limit = props.target === 'tv' ? 126 : 192;
    const budget = Math.min(availableHeight() > 0 ? availableHeight() * 0.32 : limit, limit);
    const rows = Math.min(count, Math.max(1, Math.floor((budget + gap) / (row + gap))));
    return Math.min(budget, rows * row + (rows - 1) * gap);
  };
  const selectedRank = () => {
    const root = props.rankings.groups().find((group) => group.dimension === 'rank');
    if (!root?.value) return undefined;
    return root.options.find((option) => option.id === root.value);
  };
  const heroCover = () => {
    const item = props.rankings.data()?.items[0];
    if (!item) return undefined;
    return item.entry.kind === 'drama'
      ? item.entry.drama.cover_fallback || item.entry.drama.cover
      : item.entry.actor.avatar;
  };
  const heroCoverTitle = () => {
    const item = props.rankings.data()?.items[0];
    if (!item) return undefined;
    return item.entry.kind === 'drama' ? item.entry.drama.title : item.entry.actor.name;
  };
  const unknown = () => !props.rankings.data() && !props.rankings.error();
  let primary: ViewRef | undefined;
  let more: ViewRef | undefined;
  let disposed = false;
  let moreFrame = 0;
  let moreIntent: { key: string; owns: () => boolean } | undefined;
  const primaryRef = (ref: ViewRef) => {
    primary = ref;
    props.onPrimary(ref);
  };
  const focusPrimary = () => {
    if (props.active && !disposed) primary?.focus();
  };
  effect(() => {
    if (props.rankings.loading()) return;
    const intent = moreIntent;
    moreIntent = undefined;
    if (!intent) return;
    cancelAnimationFrame(moreFrame);
    moreFrame = requestAnimationFrame(() => {
      if (disposed || !props.active || intent.key !== props.rankings.key() || !intent.owns())
        return;
      if (props.rankings.data()?.has_more) more?.focus();
      else focusPrimary();
    });
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(moreFrame);
  });
  const terminalFocus = () => {
    if (props.active && !props.rankings.data()?.has_more && !props.rankings.error())
      primary?.focus();
  };
  const moreSource = () => {
    const key = props.rankings.key();
    props.onSource(() => {
      if (!props.active || key !== props.rankings.key()) return;
      if (props.rankings.data()?.has_more) more?.focus();
      else primary?.focus();
    });
  };
  return (
    <View
      testID="rankings-page"
      onLayout={({ bounds }) => availableHeight.set(bounds.size.height)}
      class="flex-1 min-h-0 gap-7"
      style={props.target === 'tv' ? { gap: 14 } : undefined}
    >
      <If when={props.hero}>
        <If when={unknown()}>
          <RankingsHeroSkeleton target={props.target} />
        </If>
        <If when={!unknown() && !props.rankings.error()}>
          <RankingsHero
            target={props.target}
            title={selectedRank()?.label ?? '排行榜'}
            cover={heroCover()}
            coverTitle={heroCoverTitle()}
          />
        </If>
      </If>
      <If
        when={props.rankings.groups().length > 0}
        else={
          <If when={unknown()}>
            <RankingsToolbarSkeleton
              target={props.target}
              height={filterHeight() || (props.target === 'tv' ? 126 : 188)}
              rowHeight={selectorHeight()}
            />
          </If>
        }
      >
        <RankingsToolbar
          groups={props.rankings.groups()}
          collection={props.rankings.key()}
          target={props.target}
          active={props.active}
          height={filterHeight()}
          rowHeight={selectorHeight()}
          gap={filterGap()}
          onChange={props.rankings.change}
          onSource={props.onSource}
          onNavigate={props.onNavigate}
          onPrimary={primaryRef}
          onMeasureRow={measureSelector}
        />
      </If>
      <If when={props.rankings.loading() && !props.rankings.data() && !props.rankings.error()}>
        <RankingsPending target={props.target} />
      </If>
      <If when={props.rankings.error()}>
        <Notice
          error
          message={props.rankings.error()}
          retry={!props.rankings.data() ? props.rankings.retry : undefined}
        />
      </If>
      <If when={props.rankings.data() && !props.rankings.data()!.items.length}>
        <UiText tone="muted">
          {props.rankings.data()?.has_more ? '本页暂无内容，可以继续浏览' : '这个榜单暂时没有内容'}
        </UiText>
      </If>
      <If when={props.rankings.data()}>
        <ContentArrival class="flex-1">
          <RankingsList
            rankings={props.rankings}
            target={props.target}
            active={props.active}
            onOpen={props.onOpen}
            onActor={props.onActor}
            onSource={props.onSource}
            onNavigate={props.onNavigate}
            focusGuard={props.focusGuard}
          />
        </ContentArrival>
      </If>
      <If when={props.rankings.data()?.has_more}>
        <View class="items-start">
          <Button
            buttonRef={(ref) => {
              more = ref;
            }}
            onFocus={moreSource}
            testID="ranking-more"
            label={
              props.rankings.loading()
                ? '正在加载…'
                : props.rankings.error()
                  ? '重试加载更多'
                  : '加载更多'
            }
            pending={props.rankings.loading()}
            displayLabel={props.rankings.loading() ? '正在加载…' : undefined}
            onPress={() => {
              if (props.rankings.loading()) return;
              props.onNavigate();
              more?.focus();
              moreSource();
              moreIntent = { key: props.rankings.key(), owns: props.focusGuard() };
              props.rankings.loadMore();
            }}
            onFocusedRemoval={platform.os === 'macos' ? terminalFocus : undefined}
          />
        </View>
      </If>
    </View>
  );
}

export function Rankings(props: RankingsProps) {
  let disposed = false;
  cleanup(() => {
    disposed = true;
  });
  const ownsSource = (view: 'official' | 'radar') =>
    !disposed && props.active && (props.view ?? 'official') === view;
  const rememberSource = (view: 'official' | 'radar', restore: () => void) => {
    if (!ownsSource(view)) return;
    props.onSource(() => {
      if (ownsSource(view)) restore();
    });
  };
  const showHero = () => props.target === 'tv' || windowSize().height >= 900;
  const primaries = signal<Partial<Record<'official' | 'radar', ViewRef>>>({});
  const rememberPrimary = (view: 'official' | 'radar', ref: ViewRef) =>
    untracked(() => primaries.update((prior) => ({ ...prior, [view]: ref })));
  effect(() => {
    const ref = primaries()[props.view ?? 'official'];
    if (props.active && ref) props.onPrimary(ref);
  });
  return (
    <View
      class="flex-1 min-h-0"
      style={
        props.target === 'tv'
          ? { paddingTop: 16, gap: 14 }
          : desktopContentFrame({ top: 24, gap: 28 })
      }
    >
      <If when={!showHero()}>
        <UiText role="page">排行榜</UiText>
      </If>
      <If when={props.radar}>
        <Tabs
          label="榜单来源"
          testID="ranking-view"
          value={props.view ?? 'official'}
          options={[
            { value: 'official', label: '红果榜' },
            { value: 'radar', label: '榜单雷达' },
          ]}
          onChange={({ value }) => {
            props.onNavigate();
            props.onView?.(value as 'official' | 'radar');
          }}
        />
      </If>
      <View
        class={props.view === 'radar' ? 'hidden' : 'flex-1 min-h-0'}
        disabled={props.view === 'radar'}
        accessibilityElementsHidden={props.view === 'radar'}
      >
        <OfficialRankings
          {...props}
          hero={showHero()}
          active={props.active && props.view !== 'radar'}
          onSource={(restore) => rememberSource('official', restore)}
          onPrimary={(ref) => rememberPrimary('official', ref)}
        />
      </View>
      <If when={props.radar && props.view === 'radar'}>
        <Radar
          radar={props.radar!}
          target={props.target}
          active={props.active && props.view === 'radar'}
          onOpen={props.onOpen}
          onSource={(restore) => rememberSource('radar', restore)}
          onNavigate={props.onNavigate}
          focusGuard={props.focusGuard}
          onPrimary={(ref) => rememberPrimary('radar', ref)}
        />
      </If>
    </View>
  );
}
