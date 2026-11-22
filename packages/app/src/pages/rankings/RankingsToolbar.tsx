import { Scroll, View, cleanup, effect, type ViewRef } from 'nsh';
import {
  Button,
  CardControls,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  space,
  type ProductTarget,
} from '@hongguo/ui';
import type { RankingChoices } from '../../rankings';

/**
 * One visible name per selector row. A sub-rank says "子榜" because its upstream label is the
 * parent ranking it narrows; a panel keeps the upstream group name ("总榜", "受众", "题材"),
 * which is the only thing that distinguishes several panel rows from each other.
 */
const dimensionLabel = (group: RankingChoices) =>
  group.dimension === 'rank' ? '榜单' : group.dimension === 'rank_sub' ? '子榜' : group.label;

/**
 * One label column for every selector row. The width fits the longest service group name a
 * panel can carry in Chinese ("服务端时段" is five characters at meta size); a longer upstream
 * name ellipsizes here rather than shifting the chips off the shared spine.
 */
const LABEL_GUTTER = 72;

/** The shared `sm` control height, used to align a group label with its first option line. */
const RANKING_CHIP_HEIGHT = 32;

/** One filter row: chips stay one focus group with a stable collection source anchor. */
function RankingGroupSelector(props: {
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
      class="flex-row items-start gap-4"
    >
      {/* The label names the whole group, so it aligns with the first option line: centring it
          against a four-line block would float it away from the row it belongs to. */}
      <View class="justify-center" style={{ width: LABEL_GUTTER, height: RANKING_CHIP_HEIGHT + 8 }}>
        <UiText role="meta" tone="muted" lines={1}>
          {dimensionLabel(props.group)}
        </UiText>
      </View>
      {/* The options wrap onto as many lines as they need: the service supplies dozens of
          categories and a horizontal scroller would hide most of them behind a scrollbar. */}
      <View class="flex-1" style={{ minWidth: 0, paddingVertical: 4 }}>
        <View onLayout={({ bounds }) => props.onContentHeight(bounds.size.height)}>
          <CardControls
            label={props.group.label}
            class="flex-row flex-wrap items-center"
            gap={space('xs')}
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
                    labelLines={1}
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
      </View>
    </View>
  );
}

/**
 * Filter rows from the draft toolbar: chips only, no visible field labels, one hairline under
 * the group. Height stays budgeted by the page so the list keeps the remaining space.
 *
 * A ranking can carry dozens of panel groups, so only the first three are shown until the reader
 * asks for the rest. The toggle stays on its own line under the rows and reports how many
 * choices are active in the hidden groups, because a collapsed group keeps its selection.
 *
 * TV shows the same groups as named single-selects, because a remote user cannot scan a chip row
 * and a bare value does not say what it changes. It obeys the same collapsed/expanded model: a
 * dense ranking would otherwise stack every panel row into the band and push the entries off the
 * first screen.
 */
export function RankingsToolbar(props: {
  groups: RankingChoices[];
  collection: string;
  target: ProductTarget;
  active: boolean;
  height: number;
  rowHeight: number;
  gap: number;
  /** Groups shown before the reader asks for the rest. */
  visible: number;
  expanded: boolean;
  /** Choices active in the groups the collapsed view hides. */
  hiddenChoices: number;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (group: string, value: string) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  onPrimary: (ref: ViewRef) => void;
  onMeasureRow: (id: string, height: number) => void;
}) {
  /** `visible` is how many groups the collapsed view keeps, so equality still needs collapsing. */
  const collapsed = () => !props.expanded && props.groups.length > props.visible;
  /** Only the groups the reader asked for are measured and rendered. */
  const shown = () => (collapsed() ? props.groups.slice(0, props.visible) : props.groups);
  const rows = () => (
    <Each of={shown()} key={(group) => group.id}>
      {(group) => (
        <RankingGroupSelector
          group={group()}
          collection={props.collection}
          target={props.target}
          active={props.active}
          onChange={props.onChange}
          onSource={props.onSource}
          onNavigate={props.onNavigate}
          onPrimary={props.onPrimary}
          rowHeight={props.rowHeight}
          onContentHeight={(height) => props.onMeasureRow(group().id, height)}
        />
      )}
    </Each>
  );
  /**
   * The options wrap instead of scrolling sideways, so no long category row hides behind a
   * horizontal scrollbar. Collapsed, the few rows render at their own height; expanded, the
   * group list gets the page's bounded budget as a vertical scroller so a dense ranking cannot
   * push its entries off the page.
   */
  const scrolled = () => props.expanded && props.height > 0;
  /**
   * TV pairs each name with its selector on one wrapping line; the chip rows are one column.
   * The expanded block is the same bounded scroller on both, because the budget is what keeps
   * the entries on screen when a ranking carries dozens of groups.
   */
  const listClass = () => (props.target === 'tv' ? 'flex-row flex-wrap items-center' : undefined);
  const listGap = () => (props.target === 'tv' ? space('sm') : props.gap);
  const listPadding = () => (props.target === 'tv' ? space('xxs') : space('xs'));
  return (
    <View class="border-b border-border" style={{ flexShrink: 0 }}>
      <If
        when={scrolled()}
        else={
          <View
            testID="ranking-filters"
            class={listClass()}
            style={{ gap: listGap(), paddingBottom: listPadding() }}
          >
            {rows()}
          </View>
        }
      >
        <Scroll
          testID="ranking-filters"
          class={listClass()}
          style={{ height: props.height, flexGrow: 0 }}
          contentStyle={{ gap: listGap(), paddingBottom: listPadding() }}
        >
          {rows()}
        </Scroll>
      </If>
      <If when={props.groups.length > props.visible}>
        <View class="flex-row items-center gap-2" style={{ paddingTop: space('xxs') }}>
          <Button
            testID="ranking-filters-toggle"
            size="sm"
            variant="quiet"
            label={props.expanded ? '收起筛选' : '展开筛选'}
            icon="down"
            expanded={props.expanded}
            accessibilityDescription={
              props.hiddenChoices ? `已收起 ${props.hiddenChoices} 个筛选条件` : '显示其余筛选条件'
            }
            align="start"
            onFocus={() => props.onSource(() => {})}
            onPress={() => {
              props.onNavigate();
              props.onExpandedChange(!props.expanded);
            }}
          />
          {/* A collapsed group keeps its choice, so the count is the only visible trace of it. */}
          <If when={collapsed() && props.hiddenChoices > 0}>
            <UiText role="meta" tone="muted" lines={1}>
              {`已选 ${props.hiddenChoices} 项`}
            </UiText>
          </If>
        </View>
      </If>
    </View>
  );
}

/** Filter rows keep their shape while the first response is unknown: three collapsed rows. */
export function RankingsToolbarSkeleton(props: { target: ProductTarget; rowHeight: number }) {
  const rows = [0, 1, 2];
  const rowHeight = Math.max(props.rowHeight, props.target === 'tv' ? 38 : 68);
  const widths = [
    [72, 64, 56, 68],
    [72, 64],
    [72, 64],
  ];
  return (
    <SkeletonRegion
      label="正在加载筛选条件"
      testID="ranking-filters-pending"
      class="border-b border-border"
      style={{ flexShrink: 0 }}
    >
      <View style={{ gap: 4, paddingBottom: space('xs') }}>
        <Each of={rows}>
          {(row) => (
            <View class="flex-row items-center gap-2" style={{ height: rowHeight }}>
              <Each of={widths[row()]}>
                {(width) => <SkeletonBlock width={width()} height={36} radius={6} />}
              </Each>
            </View>
          )}
        </Each>
        {/* The collapsed view's own toggle keeps its line while the groups are unknown. */}
        <SkeletonBlock width={96} height={32} radius={8} />
      </View>
    </SkeletonRegion>
  );
}
