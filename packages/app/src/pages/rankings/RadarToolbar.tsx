import { View, type ViewRef } from 'nsh';
import {
  Button,
  CardControls,
  FilterChoices,
  IconButton,
  SkeletonBlock,
  SkeletonRegion,
  Tabs,
  UiText,
  type ProductTarget,
} from '@hongguo/ui';
import type { RadarKind } from '@hongguo/core-client';
import type { RadarCategory, RadarController, RadarMetric, RadarView } from '../../radar';

/** The radar control band: source meta, refresh, view tabs, filters and column controls. */
export function RadarToolbar(props: {
  radar: RadarController;
  target: ProductTarget;
  active: boolean;
  meta: string;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  onPrimary: (ref: ViewRef) => void;
  showColumns: boolean;
  onColumns: (to: 'start' | 'end') => void;
}) {
  let refresh: ViewRef | undefined;
  const tv = () => props.target === 'tv';
  /** TV rows and filters share one band: a table that shows a single row is not a comparison. */
  if (tv())
    return (
      <View class="gap-3" style={{ flexShrink: 0 }}>
        <View class="flex-row items-center gap-4">
          <View class="min-w-0 flex-1">
            <UiText role="meta" lines={1}>
              {props.meta || '来源：第三方榜单快照'}
            </UiText>
          </View>
          <Button
            testID="radar-refresh"
            icon="refresh-cw"
            label="刷新"
            size="sm"
            pending={props.radar.loading()}
            displayLabel={props.radar.loading() ? '正在刷新…' : undefined}
            buttonRef={(ref) => {
              refresh = ref;
              props.onPrimary(ref);
            }}
            onFocus={() =>
              props.onSource(() => {
                if (props.active) refresh?.focus();
              })
            }
            onPress={() => {
              props.onNavigate();
              props.radar.refresh();
            }}
          />
        </View>
        <Tabs
          label="雷达视图"
          testID="radar-view"
          value={props.radar.view()}
          options={[
            { value: 'snapshot', label: '官方快照' },
            { value: 'growth', label: '飙升榜' },
          ]}
          onChange={({ value }) => {
            props.onNavigate();
            props.radar.changeView(value as RadarView);
          }}
        />
        {tvFilters(props)}
      </View>
    );
  return (
    <View class={tv() ? 'gap-4' : 'gap-3'} style={{ flexShrink: 0 }}>
      <View class="flex-row flex-wrap items-center justify-between gap-4">
        <View class="min-w-0 flex-1">
          <UiText role="meta">
            {props.meta ? `${props.meta} · 来源：第三方榜单快照` : '来源：第三方榜单快照'}
          </UiText>
        </View>
        <Button
          testID="radar-refresh"
          icon="refresh-cw"
          label="刷新"
          size="sm"
          pending={props.radar.loading()}
          displayLabel={props.radar.loading() ? '正在刷新…' : undefined}
          buttonRef={(ref) => {
            refresh = ref;
            props.onPrimary(ref);
          }}
          onFocus={() =>
            props.onSource(() => {
              if (props.active) refresh?.focus();
            })
          }
          onPress={() => {
            props.onNavigate();
            props.radar.refresh();
          }}
        />
      </View>
      <View class="flex-row items-center justify-between gap-4">
        <Tabs
          label="雷达视图"
          testID="radar-view"
          value={props.radar.view()}
          options={[
            { value: 'snapshot', label: '官方快照' },
            { value: 'growth', label: '飙升榜' },
          ]}
          onChange={({ value }) => {
            props.onNavigate();
            props.radar.changeView(value as RadarView);
          }}
        />
        <If when={props.showColumns}>
          <CardControls label="表格列" onNavigate={props.onNavigate}>
            <IconButton
              testID="radar-columns-prev"
              label="显示前面的列"
              icon="back"
              variant="quiet"
              size="sm"
              onPress={() => {
                props.onNavigate();
                props.onColumns('start');
              }}
            />
            <IconButton
              testID="radar-columns-next"
              label="显示后面的列"
              icon="forward"
              variant="quiet"
              size="sm"
              onPress={() => {
                props.onNavigate();
                props.onColumns('end');
              }}
            />
          </CardControls>
        </If>
      </View>
      <If
        when={props.radar.view() === 'snapshot'}
        else={
          <View class="gap-3">
            <FilterChoices
              variant="chips"
              label="排序"
              testID="radar-metric"
              value={props.radar.metric()}
              active={props.active}
              items={[
                { value: 'd_hot', title: '热度增量' },
                { value: 'd_fav', title: '收藏增量' },
                { value: 'r_hot', title: '热度增长率' },
              ]}
              onSource={props.onSource}
              onNavigate={props.onNavigate}
              onChange={(value) => {
                props.onNavigate();
                props.radar.changeMetric(value as RadarMetric);
              }}
            />
            <FilterChoices
              variant="chips"
              label="类型"
              testID="radar-type"
              value={props.radar.type()}
              active={props.active}
              items={[
                { value: 'all', title: '全部' },
                { value: 'real', title: '真人' },
                { value: 'ai', title: 'AI' },
                { value: 'comic', title: '漫剧' },
                { value: 'unknown', title: '未知' },
              ]}
              onSource={props.onSource}
              onNavigate={props.onNavigate}
              onChange={(value) => {
                props.onNavigate();
                props.radar.changeType(value as RadarKind | 'all');
              }}
            />
          </View>
        }
      >
        <FilterChoices
          variant="chips"
          label="分类"
          testID="radar-category"
          value={props.radar.category()}
          active={props.active}
          items={[
            { value: 'hot', title: '综合' },
            { value: 'real', title: '真人' },
            { value: 'ai', title: 'AI' },
            { value: 'comic', title: '漫剧' },
          ]}
          onSource={props.onSource}
          onNavigate={props.onNavigate}
          onChange={(value) => {
            props.onNavigate();
            props.radar.changeCategory(value as RadarCategory);
          }}
        />
      </If>
    </View>
  );
}

/**
 * TV keeps the same filter chip rows as the desktop: options laid out inline beat a popup on a
 * remote, and each row's label column names the dimension it filters.
 */
function tvFilters(props: {
  radar: RadarController;
  active: boolean;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
}) {
  const snapshot = props.radar.view() === 'snapshot';
  return (
    <View class="gap-3">
      <If
        when={snapshot}
        else={
          <>
            <FilterChoices
              variant="chips"
              label="排序"
              testID="radar-metric"
              value={props.radar.metric()}
              active={props.active}
              items={[
                { value: 'd_hot', title: '热度增量' },
                { value: 'd_fav', title: '收藏增量' },
                { value: 'r_hot', title: '热度增长率' },
              ]}
              onSource={props.onSource}
              onNavigate={props.onNavigate}
              onChange={(value) => {
                props.onNavigate();
                props.radar.changeMetric(value as RadarMetric);
              }}
            />
            <FilterChoices
              variant="chips"
              label="类型"
              testID="radar-type"
              value={props.radar.type()}
              active={props.active}
              items={[
                { value: 'all', title: '全部' },
                { value: 'real', title: '真人' },
                { value: 'ai', title: 'AI' },
                { value: 'comic', title: '漫剧' },
                { value: 'unknown', title: '未知' },
              ]}
              onSource={props.onSource}
              onNavigate={props.onNavigate}
              onChange={(value) => {
                props.onNavigate();
                props.radar.changeType(value as RadarKind | 'all');
              }}
            />
          </>
        }
      >
        <FilterChoices
          variant="chips"
          label="分类"
          testID="radar-category"
          value={props.radar.category()}
          active={props.active}
          items={[
            { value: 'hot', title: '综合' },
            { value: 'real', title: '真人' },
            { value: 'ai', title: 'AI' },
            { value: 'comic', title: '漫剧' },
          ]}
          onSource={props.onSource}
          onNavigate={props.onNavigate}
          onChange={(value) => {
            props.onNavigate();
            props.radar.changeCategory(value as RadarCategory);
          }}
        />
      </If>
    </View>
  );
}

/** Static geometry for the first radar read: control band, header and five row shapes. */
export function RadarPending(props: { target: ProductTarget }) {
  const tv = props.target === 'tv';
  const rowHeight = tv ? 60 : 84;
  const safe = tv ? 4 : 8;
  const gap = tv ? 8 : 16;
  // The control band above already renders for real, so this skeleton draws only the table it
  // stands in for: header row plus data rows, with the same column geometry and no cover images
  // (the real rows are text-only).
  return (
    <SkeletonRegion label="正在加载榜单" testID="radar-pending" class="flex-1 min-h-0">
      <View class="flex-1 min-h-0 border-t border-border">
        <View
          class="flex-row items-center border-b border-border"
          style={{ minHeight: tv ? 36 : 48, gap, paddingHorizontal: safe }}
        >
          <SkeletonBlock width={56} height={14} radius={4} />
          <SkeletonBlock width={56} height={14} radius={4} />
          <SkeletonBlock width="32%" height={14} radius={4} />
          <SkeletonBlock width={72} height={14} radius={4} />
          <SkeletonBlock width={72} height={14} radius={4} />
        </View>
        <Each of={[0, 1, 2, 3, 4]}>
          {() => (
            <View
              class="flex-row items-center border-b border-border"
              style={{ minHeight: rowHeight, gap, paddingHorizontal: safe }}
            >
              <SkeletonBlock width={24} height={18} radius={4} />
              <View class="flex-1 gap-2">
                <SkeletonBlock width="62%" height={18} radius={4} />
                <SkeletonBlock width="38%" height={12} radius={4} />
              </View>
              <SkeletonBlock width={72} height={16} radius={4} />
              <SkeletonBlock width={72} height={16} radius={4} />
            </View>
          )}
        </Each>
      </View>
    </SkeletonRegion>
  );
}
