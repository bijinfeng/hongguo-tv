import { Scroll, View, cleanup, signal, type ViewRef } from 'nsh';
import {
  Button,
  ContentArrival,
  FilterChoices,
  Notice,
  RadarTable,
  Tabs,
  UiText,
  tvUnit,
  type ProductTarget,
  type RadarTableColumn,
  type RadarTableRef,
} from '@hongguo/ui';
import type { Drama, RadarKind } from '@hongguo/core-client';
import type { RadarCategory, RadarController, RadarMetric, RadarView } from '../radar';

const snapshotColumns: RadarTableColumn[] = [
  { key: 'rank', title: '名次', numeric: true },
  { key: 'delta', title: '变化' },
  { key: 'title', title: '短剧' },
  { key: 'type', title: '类型' },
  { key: 'hot', title: '热度', numeric: true },
  { key: 'd_hot', title: '热度增量', numeric: true },
  { key: 'd_fav', title: '收藏增量', numeric: true },
  { key: 'streak', title: '连续在榜', numeric: true },
];
const growthColumns: RadarTableColumn[] = [
  { key: 'rank', title: '排序', numeric: true },
  { key: 'title', title: '短剧' },
  { key: 'type', title: '类型' },
  { key: 'hot', title: '热度', numeric: true },
  { key: 'd_hot', title: '热度增量', numeric: true },
  { key: 'r_hot', title: '增长率', numeric: true },
  { key: 'd_fav', title: '收藏增量', numeric: true },
  { key: 'd7_hot', title: '7日热度增量', numeric: true },
];

export function Radar(props: {
  radar: RadarController;
  target: ProductTarget;
  active: boolean;
  onOpen: (drama: Drama, restore: () => void) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  onPrimary: (ref: ViewRef) => void;
}) {
  const availableHeight = signal(0);
  let table: RadarTableRef | undefined;
  let refresh: ViewRef | undefined;
  let disposed = false;
  cleanup(() => {
    disposed = true;
    table = undefined;
    refresh = undefined;
  });
  const source = (id: string) => {
    const collection = props.radar.key();
    return () => {
      if (!disposed && props.active && collection === props.radar.key())
        table?.restore(id, props.focusGuard());
    };
  };
  const open = (id: string) => {
    props.onNavigate();
    const restore = source(id);
    props.onSource(restore);
    void props.radar.open(id, props.focusGuard(), (drama) => props.onOpen(drama, restore));
  };
  const selectedBranch = () =>
    props.radar.view() === 'snapshot' ? props.radar.data()?.ranks : props.radar.data()?.growth;
  const stale = () =>
    props.radar.view() === 'snapshot'
      ? props.radar.data()?.ranks_stale
      : props.radar.data()?.growth_stale;
  const fetched = () =>
    props.radar.view() === 'snapshot'
      ? props.radar.data()?.ranks_fetched_at
      : props.radar.data()?.growth_fetched_at;
  const growthUnavailable = () =>
    props.radar.view() === 'snapshot' &&
    props.radar.data()?.ranks &&
    (!props.radar.data()?.growth || props.radar.data()?.growth_stale);
  const dates = () => {
    const snapshot = props.radar.data();
    const bucket = snapshot?.ranks?.[props.radar.category()];
    if (props.radar.view() === 'growth')
      return snapshot?.growth
        ? `指标日期 ${snapshot.growth.date}${snapshot.growth.prev_date ? ` · 对比 ${snapshot.growth.prev_date}` : ''}${snapshot.growth.gap == null ? '' : ` · 采样间隔 ${snapshot.growth.gap} 天`}`
        : '';
    return bucket
      ? `快照日期 ${bucket.rank_date}${snapshot?.growth ? ` · 指标日期 ${snapshot.growth.date}` : ''}`
      : '';
  };
  const controlsHeight = () => {
    const limit = props.target === 'tv' ? tvUnit(360) : 256;
    if (!availableHeight()) return limit;
    const tableHeight =
      selectedBranch() && props.radar.rows().length
        ? props.target === 'tv'
          ? tvUnit(280)
          : 200
        : 0;
    return Math.max(0, Math.min(limit, availableHeight() - tableHeight - 16));
  };
  return (
    <View
      testID="radar-page"
      class="flex-1 min-h-0 gap-4"
      onLayout={({ bounds }) => availableHeight.set(bounds.size.height)}
    >
      <Scroll testID="radar-controls" style={{ maxHeight: controlsHeight(), flexShrink: 0 }}>
        <View class="gap-3">
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
                  if (!disposed && props.active) refresh?.focus();
                })
              }
              onPress={() => {
                props.onNavigate();
                props.radar.refresh();
              }}
            />
          </View>
          <UiText role="meta">
            {dates() ? `${dates()} · 来源：hongguo-radar 外部聚合` : '来源：hongguo-radar 外部聚合'}
          </UiText>
          <If
            when={props.radar.view() === 'snapshot'}
            else={
              <View class={props.target === 'tv' ? 'flex-row gap-6' : 'gap-2'}>
                <FilterChoices
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
          <If when={props.radar.error()}>
            <View class="flex-row items-center gap-4">
              <UiText tone="error">
                {props.radar.data() ? '刷新失败，保留最近成功数据' : props.radar.error()}
              </UiText>
              <Button
                testID="radar-retry"
                label="重试"
                size="sm"
                onPress={() => {
                  props.onNavigate();
                  props.radar.refresh();
                }}
              />
            </View>
          </If>
          <If
            when={
              (selectedBranch() && stale()) ||
              growthUnavailable() ||
              props.radar.data()?.cache_write_failed
            }
          >
            <View class="flex-row flex-wrap gap-2">
              <If when={selectedBranch() && stale()}>
                <UiText
                  testID="radar-stale"
                  role="meta"
                >{`显示最近成功数据${fetched() ? ` · 获取于 ${fetched()}` : ''}`}</UiText>
              </If>
              <If when={growthUnavailable()}>
                <UiText testID="radar-growth-status" role="meta">
                  {!props.radar.data()?.growth
                    ? '增长数据暂不可用，快照仍可查看'
                    : `增长指标使用最近成功数据${props.radar.data()?.growth_fetched_at ? ` · 获取于 ${props.radar.data()!.growth_fetched_at}` : ''}`}
                </UiText>
              </If>
              <If when={props.radar.data()?.cache_write_failed}>
                <UiText testID="radar-cache-warning" role="meta">
                  本次数据未能保存，下次启动可能需要重新读取
                </UiText>
              </If>
            </View>
          </If>
          <If when={props.radar.detailError()}>
            <View class="flex-row items-center gap-4">
              <UiText tone="error">{props.radar.detailError()!.message}</UiText>
              <Button
                testID="radar-detail-retry"
                label="重试详情"
                size="sm"
                displayLabel={
                  props.radar.pending() === props.radar.detailError()!.id
                    ? '正在读取详情…'
                    : undefined
                }
                onPress={() => open(props.radar.detailError()!.id)}
              />
            </View>
          </If>
          <If when={props.radar.loading() && !props.radar.data()}>
            <UiText role="body" tone="muted">
              正在读取雷达…
            </UiText>
          </If>
          <If when={props.radar.data() && !selectedBranch()}>
            <Notice
              testID="radar-branch-unavailable"
              message={
                props.radar.view() === 'snapshot'
                  ? '官方快照暂不可用，飙升榜仍可查看'
                  : '增长数据暂不可用，官方快照仍可查看'
              }
            />
          </If>
          <If when={selectedBranch() && !props.radar.rows().length}>
            <UiText testID="radar-empty" tone="muted">
              当前分类暂无数据
            </UiText>
          </If>
        </View>
      </Scroll>
      <If when={selectedBranch() && props.radar.rows().length > 0}>
        <ContentArrival class="flex-1 min-h-0">
          <RadarTable
            columns={props.radar.view() === 'snapshot' ? snapshotColumns : growthColumns}
            rows={props.radar.rows()}
            selected={props.radar.selected()}
            pending={props.radar.pending()}
            active={props.active}
            collection={props.radar.key()}
            tableRef={(ref) => {
              table = ref;
            }}
            onNavigate={props.onNavigate}
            onOpen={({ id }) => open(id)}
            onSource={({ id }) => props.onSource(source(id))}
          />
        </ContentArrival>
      </If>
    </View>
  );
}
