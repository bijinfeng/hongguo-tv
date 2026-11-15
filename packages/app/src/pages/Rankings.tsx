import {
  List,
  Scroll,
  View,
  cleanup,
  effect,
  platform,
  signal,
  untracked,
  type ListRef,
  type ViewRef,
} from 'nsh';
import {
  Button,
  CardControls,
  ContentArrival,
  Notice,
  RankingCard,
  Tabs,
  UiText,
  tvUnit,
  controlMetrics,
  type ProductTarget,
} from '@hongguo/ui';
import type { Drama, RankItem } from '@hongguo/core-client';
import { rankingIdentity, type RankingChoices, type RankingsController } from '../rankings';
import type { RadarController } from '../radar';
import { Radar } from './Radar';

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

function RankingSelector(props: {
  group: RankingChoices;
  collection: string;
  target: ProductTarget;
  active: boolean;
  onChange: (group: string, value: string) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  onPrimary: (ref: ViewRef) => void;
  rowHeight: number;
  onContentHeight: (height: number) => void;
}) {
  const refs = new Map<string, ViewRef>();
  let row: ViewRef | undefined;
  return (
    <View
      ref={(ref) => {
        row = ref;
      }}
      class="flex-row items-center gap-4"
    >
      <If when={props.group.dimension === 'rank_panel'}>
        <UiText role="meta" tone="muted">
          {props.group.label}
        </UiText>
      </If>
      <Scroll
        horizontal
        class="flex-1"
        style={{ height: props.rowHeight }}
        contentStyle={{ padding: props.target === 'tv' ? tvUnit(8) : 8 }}
      >
        <View onLayout={({ bounds }) => props.onContentHeight(bounds.size.height)}>
          <CardControls
            label={props.group.label}
            class="gap-2 flex-nowrap items-center"
            onNavigate={props.onNavigate}
          >
            <Each of={Array.from({ length: props.group.options.length }, (_, index) => index)}>
              {(slot) => {
                const option = () => props.group.options[slot()];
                let ref: ViewRef | undefined;
                effect(() => {
                  const id = option().id;
                  if (ref) {
                    refs.set(id, ref);
                    if (
                      props.group.dimension === 'rank' &&
                      (props.group.value === id ||
                        (props.group.value === undefined && slot() === 0))
                    )
                      props.onPrimary(ref);
                  }
                  cleanup(() => {
                    if (refs.get(id) === ref) refs.delete(id);
                  });
                });
                const source = () => {
                  const id = option().id;
                  const collection = props.collection;
                  return () => {
                    if (props.active && collection === props.collection) refs.get(id)?.focus();
                  };
                };
                return (
                  <Button
                    size="sm"
                    variant="quiet"
                    buttonRef={(node) => {
                      ref = node;
                      refs.set(option().id, node);
                      if (
                        props.group.dimension === 'rank' &&
                        (props.group.value === option().id ||
                          (props.group.value === undefined && slot() === 0))
                      )
                        props.onPrimary(node);
                    }}
                    testID={`ranking-choice-${encodeURIComponent(props.group.id)}-${encodeURIComponent(option().id)}`}
                    label={option().label}
                    selected={props.group.value === option().id}
                    onFocus={() => {
                      if (props.active) row?.reveal({ vertical: 'nearest', animated: false });
                      props.onSource(source());
                    }}
                    onPress={() => {
                      const id = option().id;
                      props.onNavigate();
                      props.onChange(props.group.id, id);
                      props.onSource(source());
                    }}
                  />
                );
              }}
            </Each>
          </CardControls>
        </View>
      </Scroll>
    </View>
  );
}

/** Approved one-column desktop / two-column TV rows, retaining kind:id source anchors. */
function RankingCollection(props: RankingsProps) {
  const items = () => props.rankings.data()?.items ?? [];
  const columns = () => (props.target === 'tv' ? 2 : 1);
  const refs = new Map<string, ViewRef>();
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  let cardFrame = 0;
  let cardIntent:
    | { id: string; owns: () => boolean; restorePosition: boolean; checked: boolean }
    | undefined;
  let disposed = false;
  let measurement = 0;
  const collection = props.rankings.key();
  const owns = () => !disposed && props.active && props.rankings.key() === collection;
  const restoreScroll = (source?: string) => {
    if (!owns()) return;
    const index = items().findIndex((item) => rankingIdentity(item) === (source ?? anchor?.id));
    if (index >= 0)
      list?.scrollToIndex({
        index: Math.floor(index / columns()),
        viewPosition: source ? 0.5 : 0,
        viewOffset: source ? 0 : -(anchor?.offset ?? 0),
        animated: false,
      });
  };
  const restoreCard = () => {
    cancelAnimationFrame(cardFrame);
    cardFrame = requestAnimationFrame(() => {
      const intent = cardIntent;
      if (!intent) return;
      if (!owns() || !intent.owns()) {
        cardIntent = undefined;
        return;
      }
      if (intent.restorePosition) {
        intent.restorePosition = false;
        restoreScroll();
        restoreCard();
        return;
      }
      const ref = refs.get(intent.id);
      if (!ref) {
        restoreScroll(intent.id);
        return;
      }
      void Promise.all([ref.measure(), list?.measure()]).then(([card, viewport]) => {
        if (cardIntent !== intent || !owns() || !intent.owns() || refs.get(intent.id) !== ref)
          return;
        const inset = props.target === 'tv' ? tvUnit(8) : 8;
        if (
          !card ||
          !viewport ||
          card.pagePosition.y < viewport.pagePosition.y + inset ||
          card.pagePosition.y + card.bounds.size.height >
            viewport.pagePosition.y + viewport.bounds.size.height - inset
        ) {
          if (!intent.checked) {
            intent.checked = true;
            restoreScroll(intent.id);
            restoreCard();
          }
          // Ref/layout notifications resume unsettled geometry; never loop or focus a clipped row.
          return;
        }
        ref.focus();
      });
    });
  };
  effect(() => {
    measurement++;
    if (!props.active) {
      cardIntent = undefined;
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => restoreScroll());
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(cardFrame);
  });
  const source = (item: RankItem) => {
    const id = rankingIdentity(item);
    return () => {
      if (!owns() || !items().some((candidate) => rankingIdentity(candidate) === id)) return;
      cardIntent = { id, owns: props.focusGuard(), restorePosition: true, checked: false };
      restoreCard();
    };
  };
  const title = (item: RankItem) =>
    item.entry.kind === 'drama' ? item.entry.drama.title : item.entry.actor.name;
  const subtitle = (item: RankItem) =>
    item.entry.kind === 'drama' ? item.entry.drama.intro : item.entry.actor.description;
  const cover = (item: RankItem) =>
    item.entry.kind === 'drama'
      ? item.entry.drama.cover_fallback || item.entry.drama.cover
      : item.entry.actor.avatar;
  const metadata = (item: RankItem) => {
    const tags = item.entry.kind === 'drama' ? item.entry.drama.tags : item.entry.tags;
    return [item.badge, item.heat, ...(tags ?? [])].filter(Boolean).join(' · ');
  };
  return (
    <List
      ref={(ref) => {
        list = ref;
      }}
      testID="ranking-results"
      class="flex-1"
      style={{ width: '100%', maxWidth: props.target === 'tv' ? tvUnit(1250) : 1100 }}
      onLayout={() => {
        if (cardIntent) restoreCard();
      }}
      onScroll={() => {
        if (!owns()) return;
        const current = ++measurement;
        void list?.measureScrollPosition().then((position) => {
          if (!owns() || current !== measurement || !position) return;
          const first = items()[position.index * columns()];
          if (first) anchor = { id: rankingIdentity(first), offset: position.offset };
        });
      }}
      each={Array.from({ length: Math.ceil(items().length / columns()) }, (_, index) => ({
        id: rankingIdentity(items()[index * columns()]),
        items: items().slice(index * columns(), (index + 1) * columns()),
      }))}
      keyExtractor={(row) => row.id}
      estimatedItemSize={props.target === 'tv' ? tvUnit(160) : 152}
      contentStyle={{
        gap: props.target === 'tv' ? tvUnit(8) : 0,
        paddingHorizontal: props.target === 'tv' ? tvUnit(8) : 8,
      }}
    >
      {(row) => (
        <View style={{ paddingVertical: props.target === 'tv' ? tvUnit(8) : 8 }}>
          <CardControls
            label="榜单条目"
            class={props.target === 'tv' ? 'w-full gap-3' : 'w-full gap-6'}
            onNavigate={props.onNavigate}
          >
            <Each of={Array.from({ length: columns() }, (_, index) => index)}>
              {(slot) => (
                <View class="flex-1">
                  <If when={row().items[slot()]}>
                    {(item) => {
                      let ref: ViewRef | undefined;
                      effect(() => {
                        const id = rankingIdentity(item());
                        if (ref) refs.set(id, ref);
                        if (cardIntent?.id === id) restoreCard();
                        cleanup(() => {
                          if (refs.get(id) === ref) refs.delete(id);
                        });
                      });
                      return (
                        <RankingCard
                          kind={item().entry.kind}
                          title={title(item())}
                          cover={cover(item())}
                          subtitle={subtitle(item())}
                          metadata={metadata(item())}
                          rank={item().rank}
                          actionLabel={item().entry.kind === 'drama' ? '查看详情' : '查看作品'}
                          testID={`ranking-${rankingIdentity(item())}`}
                          selected={props.rankings.selected() === rankingIdentity(item())}
                          buttonRef={(node) => {
                            ref = node;
                            refs.set(rankingIdentity(item()), node);
                            if (cardIntent?.id === rankingIdentity(item())) restoreCard();
                          }}
                          onFocus={() => {
                            if (cardIntent?.id === rankingIdentity(item())) cardIntent = undefined;
                            props.onSource(source(item()));
                          }}
                          onPress={() => {
                            props.onNavigate();
                            props.rankings.selected.set(rankingIdentity(item()));
                            const restore = source(item());
                            props.onSource(restore);
                            const entry = item().entry;
                            if (entry.kind === 'drama') props.onOpen(entry.drama, restore);
                            else props.onActor(entry.actor.id, entry.actor.name, restore);
                          }}
                        />
                      );
                    }}
                  </If>
                </View>
              )}
            </Each>
          </CardControls>
        </View>
      )}
    </List>
  );
}

function OfficialRankings(props: RankingsProps) {
  const availableHeight = signal(0);
  const selectorHeights = signal<Record<string, number>>({});
  const filterGap = () => (props.target === 'tv' ? tvUnit(4) : 4);
  const selectorHeight = () =>
    Math.max(
      controlMetrics('sm').height,
      ...props.rankings.groups().map((group) => selectorHeights()[group.id] ?? 0),
    ) + (props.target === 'tv' ? tvUnit(16) : 16);
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
    const limit = props.target === 'tv' ? tvUnit(252) : 192;
    const budget = Math.min(availableHeight() > 0 ? availableHeight() * 0.32 : limit, limit);
    const rows = Math.min(count, Math.max(1, Math.floor((budget + gap) / (row + gap))));
    return Math.min(budget, rows * row + (rows - 1) * gap);
  };
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
      style={props.target === 'tv' ? { gap: tvUnit(28) } : undefined}
    >
      <Scroll testID="ranking-filters" style={{ height: filterHeight(), flexShrink: 0 }}>
        <View style={{ gap: filterGap() }}>
          <Each of={props.rankings.groups()} key={(group) => group.id}>
            {(group) => (
              <RankingSelector
                group={group()}
                collection={props.rankings.key()}
                target={props.target}
                active={props.active}
                onChange={props.rankings.change}
                onSource={props.onSource}
                onNavigate={props.onNavigate}
                onPrimary={primaryRef}
                rowHeight={selectorHeight()}
                onContentHeight={(height) => measureSelector(group().id, height)}
              />
            )}
          </Each>
        </View>
      </Scroll>
      <If when={props.rankings.loading() && !props.rankings.data()}>
        <UiText tone="muted">正在加载榜单…</UiText>
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
          <RankingCollection
            rankings={props.rankings}
            target={props.target}
            active={props.active}
            onOpen={props.onOpen}
            onActor={props.onActor}
            onSource={props.onSource}
            onNavigate={props.onNavigate}
            focusGuard={props.focusGuard}
            onPrimary={props.onPrimary}
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
  const primaries = signal<Partial<Record<'official' | 'radar', ViewRef>>>({});
  const rememberPrimary = (view: 'official' | 'radar', ref: ViewRef) =>
    untracked(() => primaries.update((prior) => ({ ...prior, [view]: ref })));
  effect(() => {
    const ref = primaries()[props.view ?? 'official'];
    if (props.active && ref) props.onPrimary(ref);
  });
  return (
    <View
      class={`flex-1 min-h-0 gap-7 ${props.target === 'desktop' ? 'px-10 pt-7 pb-8' : ''}`}
      style={props.target === 'tv' ? { paddingTop: tvUnit(32), gap: tvUnit(28) } : undefined}
    >
      <UiText role="page">排行榜</UiText>
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
