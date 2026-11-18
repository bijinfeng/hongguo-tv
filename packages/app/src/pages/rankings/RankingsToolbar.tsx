import { Scroll, View, cleanup, effect, type ViewRef } from 'nsh';
import {
  Button,
  CardControls,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  type ProductTarget,
} from '@hongguo/ui';
import type { RankingChoices } from '../../rankings';

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
        contentStyle={{ padding: props.target === 'tv' ? 4 : 8 }}
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
                    labelLines={1}
                    selected={props.group.value === option().id}
                    style={{ borderRadius: 6 }}
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

/**
 * Filter rows from the draft toolbar: chips only, no visible field labels, one hairline under
 * the group. Height stays budgeted by the page so the list keeps the remaining space.
 */
export function RankingsToolbar(props: {
  groups: RankingChoices[];
  collection: string;
  target: ProductTarget;
  active: boolean;
  height: number;
  rowHeight: number;
  gap: number;
  onChange: (group: string, value: string) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  onPrimary: (ref: ViewRef) => void;
  onMeasureRow: (id: string, height: number) => void;
}) {
  return (
    <View class="border-b border-border" style={{ flexShrink: 0 }}>
      <Scroll testID="ranking-filters" style={{ height: props.height }}>
        <View style={{ gap: props.gap, paddingBottom: props.target === 'tv' ? 5 : 10 }}>
          <Each of={props.groups} key={(group) => group.id}>
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
        </View>
      </Scroll>
    </View>
  );
}

/** Filter rows keep their height while the first response is unknown. */
export function RankingsToolbarSkeleton(props: {
  target: ProductTarget;
  height: number;
  rowHeight: number;
}) {
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
      <View style={{ height: props.height, gap: 4 }}>
        <Each of={rows}>
          {(row) => (
            <View class="flex-row items-center gap-2" style={{ height: rowHeight }}>
              <Each of={widths[row()]}>
                {(width) => <SkeletonBlock width={width()} height={36} radius={6} />}
              </Each>
            </View>
          )}
        </Each>
      </View>
    </SkeletonRegion>
  );
}
