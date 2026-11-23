import { Scroll, View, type ViewRef } from 'nsh';
import {
  Button,
  LabeledChoiceList,
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

/** One filter row: the shared labelled option list, with this page's focus and reveal behaviour. */
function RankingGroupSelector(props: {
  group: RankingChoices;
  collection: string;
  target: ProductTarget;
  active: boolean;
  onChange: (group: string, value: string) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  onPrimary: (ref: ViewRef) => void;
  onMeasureRow: (height: number) => void;
}) {
  const refs = new Map<string, ViewRef>();
  let row: ViewRef | undefined;
  const primaryFor = (group: RankingChoices) => {
    // Collapsed upstream state has no value: the first option is the one in effect.
    const first = group.options[0]?.id;
    return group.value === undefined ? first : group.value;
  };
  /** A restore only reaches a live collection: a superseded ranking may not steal the focus. */
  const restoreFor = (value: string) => {
    const collection = props.collection;
    return () => {
      if (props.active && collection === props.collection) refs.get(value)?.focus();
    };
  };
  return (
    <View
      ref={(ref) => {
        row = ref;
      }}
      onLayout={({ bounds }) => props.onMeasureRow(bounds.size.height)}
    >
      <LabeledChoiceList
        title={dimensionLabel(props.group)}
        label={props.group.label}
        value={props.group.value ?? props.group.options[0]?.id ?? ''}
        items={props.group.options.map((option) => ({ value: option.id, title: option.label }))}
        testID={`ranking-choice-${encodeURIComponent(props.group.id)}`}
        onNavigate={props.onNavigate}
        onOptionRef={(value, ref) => {
          refs.set(value, ref);
          if (props.group.dimension === 'rank' && value === primaryFor(props.group))
            props.onPrimary(ref);
        }}
        onOptionFocus={() => row?.reveal({ vertical: 'nearest', animated: false })}
        restoreFor={restoreFor}
        onSource={(restore) => props.onSource(restore)}
        onChange={(value) => props.onChange(props.group.id, value)}
      />
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
  /**
   * A group with one option is descriptive data, not an actionable filter. Keep it visible instead
   * of adding a disclosure footer when the ranking only has three real choices.
   */
  const expandableGroups = () =>
    props.groups.slice(props.visible).filter((group) => group.options.length > 1);
  const canExpand = () => expandableGroups().length > 0;
  const collapsed = () => !props.expanded && canExpand();
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
          onMeasureRow={(height) => props.onMeasureRow(group().id, height)}
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
      <If when={canExpand()}>
        <View
          class={`flex-row items-center border-t border-border ${collapsed() && props.hiddenChoices > 0 ? 'justify-between' : 'justify-end'}`}
          style={{ paddingVertical: space('xs') }}
        >
          <If when={collapsed() && props.hiddenChoices > 0}>
            <UiText role="meta" tone="muted" lines={1}>
              {`已选 ${props.hiddenChoices} 项`}
            </UiText>
          </If>
          <Button
            testID="ranking-filters-toggle"
            size="sm"
            variant="default"
            label={props.expanded ? '收起筛选' : '展开筛选'}
            icon="down"
            expanded={props.expanded}
            selected={props.expanded}
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
