import {
  View,
  cleanup,
  effect,
  fontScale,
  platform,
  signal,
  untracked,
  windowSize,
  type ViewRef,
} from 'nsh';
import {
  Button,
  ContentArrival,
  Notice,
  Tabs,
  UiText,
  controlMetrics,
  space,
  type ProductTarget,
} from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import type { RankingsController } from '../rankings';
import type { RadarController } from '../radar';
import { Radar } from './Radar';
import { RankingsHero, RankingsHeroSkeleton } from './rankings/RankingsHero';
import { RankingsPending, RankingsList } from './rankings/RankingsList';
import { RankingsToolbar, RankingsToolbarSkeleton } from './rankings/RankingsToolbar';
import { rankingBandInset } from './rankings/layout';

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
  /** Collapsed by default: three rows cover the ranking, its sub-ranking and the first panel. */
  const filtersExpanded = signal(false);
  const selectorHeights = signal<Record<string, number>>({});
  const filterGap = () => space('xxs');
  const rowHeight = () =>
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
  /**
   * Collapsed, the three visible rows render at their own height, so the page passes `0`.
   * Expanded, a dense ranking can carry 32 panel groups; the block then becomes a bounded
   * vertical scroller that keeps the entries on screen. The height is the sum of whole measured
   * group heights, so it never ends on a cut-in-half row: a group may wrap onto several chip
   * lines, so its real height is measured after layout rather than assumed from the control size.
   */
  const filterHeight = () => {
    if (!filtersExpanded() || !props.rankings.groups().length) return 0;
    // The expanded block may take a third of the page; the entries keep the rest and the
    // collapsed view keeps the first screen free of any inner scrollbar.
    const limit = props.target === 'tv' ? 320 : 300;
    const budget = Math.min(limit, Math.floor((availableHeight() || limit) * 0.42));
    if (budget <= 0) return 0;
    const gap = filterGap();
    let used = 0;
    for (const group of props.rankings.groups()) {
      const measured = selectorHeights()[group.id] ?? 0;
      if (!measured) continue;
      const next = used === 0 ? measured : used + gap + measured;
      if (next > budget) break;
      used = next;
    }
    return used;
  };
  /**
   * The collapsed view keeps the first three groups. The service builds them in one order — the
   * ranking, then its sub-ranking, then that ranking's panel groups — so three rows always cover
   * the ranking and its first filters, whatever depth the panel list reaches.
   */
  const COLLAPSED_GROUPS = 3;
  /**
   * Choices the reader made in the groups the collapsed view hides. The service marks a default
   * in every group it sends, so counting any selected value would report the server's own
   * defaults as the reader's choices; only an explicit selection counts.
   */
  const hiddenChoiceCount = () => {
    if (filtersExpanded()) return 0;
    return props.rankings
      .groups()
      .slice(COLLAPSED_GROUPS)
      .filter(
        (group) =>
          group.options.length > 1 &&
          group.value !== undefined &&
          group.value !== '' &&
          group.value !== group.options.find((option) => option.selected)?.id,
      ).length;
  };
  const selectedRank = () => {
    const root = props.rankings.groups().find((group) => group.dimension === 'rank');
    // An empty string is a legal upstream option ID, so only an absent value means "no choice".
    if (root?.value === undefined) return undefined;
    return root.options.find((option) => option.id === root.value);
  };
  /**
   * The heading names the ranking itself. Upstream calls its default root option "全部", which
   * says nothing as a page title, so that label is skipped and the concrete sub-ranking the root
   * narrows to is used instead — both are service labels, never invented names.
   */
  const rankLabel = () => {
    const root = selectedRank();
    if (!root) return '排行榜';
    const generic = ['全部', '总榜', '综合'].includes(root.label.trim());
    if (!generic) return root.label;
    const sub = props.rankings
      .groups()
      .find((group) => group.dimension === 'rank_sub' && group.value !== undefined);
    const chosen = sub?.options.find((option) => option.id === sub.value);
    return chosen?.label ?? '排行榜';
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
      class="flex-1 min-h-0"
      style={{ gap: props.target === 'tv' ? 8 : 20 }}
    >
      <If when={props.hero}>
        <If when={unknown()}>
          <RankingsHeroSkeleton target={props.target} />
        </If>
        {/* A continuation failure keeps its rows and its header: the ranking name identifies where
            the user is, so only a first load without any response owns the skeleton. */}
        <If when={!unknown()}>
          <RankingsHero
            target={props.target}
            title={rankLabel()}
            cover={heroCover()}
            coverTitle={heroCoverTitle()}
          />
        </If>
      </If>
      <If when={!props.hero && unknown()}>
        <RankingsHeroSkeleton target={props.target} />
      </If>
      <If when={!props.hero && !unknown()}>
        <UiText role="page">{rankLabel()}</UiText>
      </If>
      <View
        class={props.target === 'tv' ? 'flex-1 min-h-0 flex-row' : 'flex-1 min-h-0'}
        style={{ gap: props.target === 'tv' ? 24 : 20 }}
      >
        <View
          class={props.target === 'tv' ? 'min-h-0' : undefined}
          style={
            props.target === 'tv'
              ? { width: fontScale() >= 1.75 ? 184 : 144, flexShrink: 0 }
              : undefined
          }
        >
          <If
            when={props.rankings.groups().length > 0}
            else={
              <If when={unknown()}>
                <RankingsToolbarSkeleton target={props.target} rowHeight={rowHeight()} />
              </If>
            }
          >
            <RankingsToolbar
              groups={props.rankings.groups()}
              collection={props.rankings.key()}
              target={props.target}
              active={props.active}
              height={filterHeight()}
              rowHeight={rowHeight()}
              gap={filterGap()}
              visible={COLLAPSED_GROUPS}
              expanded={filtersExpanded()}
              hiddenChoices={hiddenChoiceCount()}
              onExpandedChange={(expanded) => filtersExpanded.set(expanded)}
              onChange={(group, value) => {
                // A different ranking brings an unrelated group set, so it starts collapsed again;
                // choosing an option inside an open group leaves that group open.
                const root =
                  props.rankings.groups().find((candidate) => candidate.id === group)?.dimension ===
                  'rank';
                if (root) filtersExpanded.set(false);
                props.rankings.change(group, value);
              }}
              onSource={props.onSource}
              onNavigate={props.onNavigate}
              onPrimary={primaryRef}
              onMeasureRow={measureSelector}
            />
          </If>
        </View>
        <View class="flex-1 min-h-0" style={{ gap: props.target === 'tv' ? 12 : 20 }}>
          <If when={props.rankings.loading() && !props.rankings.data() && !props.rankings.error()}>
            <RankingsPending target={props.target} />
          </If>
          {/* A kept board answers the previous selection; say so, but never by adding a row that
          shifts the list under the reader's focus. */}
          <If when={props.rankings.stale()}>
            <UiText role="meta" tone="muted">
              {props.rankings.error() ? '榜单未切换，仍是上一次的结果' : '正在切换榜单…'}
            </UiText>
          </If>
          <If when={props.rankings.error() && !props.rankings.data()}>
            <Notice error message={props.rankings.error()} retry={props.rankings.retry} />
          </If>
          <If when={props.rankings.error() && !!props.rankings.data() && props.rankings.stale()}>
            <Notice error message={props.rankings.error()} retry={props.rankings.retry} />
          </If>
          <If when={props.rankings.data() && !props.rankings.data()!.items.length}>
            <View class="items-start" style={{ gap: space('md'), paddingVertical: space('lg') }}>
              <UiText role="title">这个榜单暂时没有内容</UiText>
              <UiText role="meta" tone="muted" lines={2}>
                {props.rankings.data()?.has_more
                  ? '本页暂无内容，可以继续浏览。'
                  : '该榜单当前没有可展示的条目，换个榜单或稍后再看。'}
              </UiText>
              <Button
                label="换个榜单"
                testID="ranking-empty-switch"
                onPress={() => {
                  props.onNavigate();
                  // The selector rows sit above the empty board; send the reader back to them.
                  focusPrimary();
                }}
              />
            </View>
          </If>
          <If when={props.rankings.data()}>
            <ContentArrival class={props.target === 'tv' ? 'flex-1 min-h-0' : 'flex-1'}>
              <RankingsList
                rankings={props.rankings}
                target={props.target}
                active={props.active}
                onOpen={props.onOpen}
                onActor={props.onActor}
                onSource={props.onSource}
                onNavigate={props.onNavigate}
                focusGuard={props.focusGuard}
                footer={
                  <If when={props.rankings.data()?.has_more}>
                    <View
                      class="items-start"
                      style={{ paddingVertical: space('sm'), gap: space('sm') }}
                    >
                      {/* A failed continuation is stated next to the button that retries it, so the
                      notice never splits a half-drawn row from its retry entry. */}
                      <If when={props.rankings.error()}>
                        <Notice error message={props.rankings.error()} />
                      </If>
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
                }
              />
            </ContentArrival>
          </If>
        </View>
      </View>
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
  /**
   * The draft header carries the ranking's identity, so it stays at both checked desktop sizes
   * (1180×780 and 1440×1000) and on TV. Only a window too short to keep entries below it falls
   * back to the plain page heading, and that threshold sits under the shorter checked size.
   */
  const showHero = () => props.target !== 'tv' && windowSize().height >= 740;
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
          ? // SafeFrame owns the TV content insets.
            { paddingTop: space('sm'), gap: space('sm') }
          : {
              width: '100%',
              // The column includes its own side inset, so the hero, the toolbar and the list
              // resolve to one width instead of the list being inset twice.
              paddingHorizontal: rankingBandInset(),
              paddingTop: space('lg'),
              paddingBottom: space('2xl'),
              gap: space('lg'),
            }
      }
    >
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
      {/* The selected tab already names the view, and a second 32px heading pushed the table
          below the fold at 1180×780. The radar toolbar names its own branch instead. */}
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
