import { List, View, cleanup, effect, type JSX, type ListRef, type ViewRef } from 'nsh';
import {
  CardControls,
  RankingCard,
  SkeletonBlock,
  SkeletonRegion,
  type ProductTarget,
  space,
} from '@hongguo/ui';
import type { Drama, RankItem } from '@hongguo/core-client';
import { rankingIdentity, type RankingsController } from '../../rankings';
import { RANKING_ROW_SAFE } from './layout';

export interface RankingsListProps {
  rankings: RankingsController;
  target: ProductTarget;
  active: boolean;
  /** Continuation control that belongs to the rows, so it scrolls with them. */
  footer?: JSX.Element;
  onOpen: (drama: Drama, restore: () => void) => void;
  onActor: (id: string, title: string, restore: () => void) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
}

/** Approved one-column desktop / two-column TV rows, retaining kind:id source anchors. */
export function RankingsList(props: RankingsListProps) {
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
        const inset = RANKING_ROW_SAFE;
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
  let previousCollection = props.rankings.key();
  effect(() => {
    const next = props.rankings.key();
    if (next === previousCollection) return;
    previousCollection = next;
    // A different board starts at its top. The page now keeps the old rows visible while the
    // new selection loads, so without this the reader would land mid-list on an unrelated board.
    anchor = undefined;
    cardIntent = undefined;
    list?.scrollToOffset({ offset: 0, animated: false });
  });
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
      style={{ width: '100%' }}
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
      footer={props.footer}
      estimatedItemSize={props.target === 'tv' ? 152 : 196}
      contentStyle={{ gap: props.target === 'tv' ? 4 : 0 }}
    >
      {(row) => (
        // The focus ring needs 6 outside the row and a scroller clips its content, so each row
        // keeps that gutter itself: the outline stays visible and the hairline still reaches the
        // band's edge.
        <View
          style={{
            paddingVertical: RANKING_ROW_SAFE,
            paddingHorizontal: RANKING_ROW_SAFE,
          }}
        >
          <CardControls
            label="榜单条目"
            class={props.target === 'tv' ? 'w-full items-stretch gap-4' : 'w-full gap-6'}
            onNavigate={props.onNavigate}
          >
            <Each of={Array.from({ length: columns() }, (_, index) => index)}>
              {(slot) => (
                <View class={props.target === 'tv' ? 'flex-1 flex-col' : 'flex-1'}>
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
                          actionPlacement={props.target === 'tv' ? 'none' : 'inline'}
                          density={props.target === 'tv' ? 'compact' : 'regular'}
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

/** First-paint rows that keep the approved ranking row geometry; no shimmer or entrance. */
export function RankingsPending(props: { target: ProductTarget }) {
  const tv = () => props.target === 'tv';
  const cover = () => (tv() ? { width: 70, height: 94 } : { width: 86, height: 116 });
  return (
    <SkeletonRegion label="正在加载榜单" testID="ranking-pending" class="flex-1">
      <View style={{ gap: tv() ? 4 : 0, paddingHorizontal: tv() ? 4 : 8 }}>
        <Each of={[0, 1, 2, 3, 4]}>
          {(slot) => (
            <View
              style={{
                paddingVertical: space(tv() ? 'sm' : 'lg'),
                gap: space(tv() ? 'sm' : 'md'),
                flexDirection: 'row',
                alignItems: 'center',
                borderBottomWidth: 1,
              }}
              class="border-b-border"
            >
              <SkeletonBlock width={tv() ? 36 : 42} height={space('lg')} radius={space('xxs')} />
              <SkeletonBlock width={cover().width} height={cover().height} radius={space('sm')} />
              <View style={{ flex: 1, gap: space('xs') }}>
                <SkeletonBlock width={slot() % 2 ? '52%' : '38%'} height={tv() ? 20 : 20} />
                <SkeletonBlock width="82%" height={space('md')} />
                <SkeletonBlock width="64%" height={space('md')} />
              </View>
            </View>
          )}
        </Each>
      </View>
    </SkeletonRegion>
  );
}
