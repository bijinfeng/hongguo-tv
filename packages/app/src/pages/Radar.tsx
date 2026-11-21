import { View, cleanup, type ViewRef } from 'nsh';
import {
  Button,
  ContentArrival,
  Notice,
  RadarTable,
  UiText,
  type ProductTarget,
  type RadarTableColumn,
  type RadarTableRef,
} from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import type { RadarController } from '../radar';
import { utcStampLabel } from '../format';
import { RadarPending, RadarToolbar } from './rankings/RadarToolbar';

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
/**
 * A 960×540 TV window cannot show eight full numeric columns without clipping the numbers it
 * exists to compare. TV therefore keeps the ranking identity plus the columns that answer
 * "what is it now" (snapshot) or "what moved" (growth); the desktop table keeps the full set.
 */
const tvSnapshotColumns: RadarTableColumn[] = [
  { key: 'rank', title: '名次', numeric: true },
  { key: 'title', title: '短剧' },
  { key: 'type', title: '类型' },
  { key: 'hot', title: '热度', numeric: true },
  { key: 'd_hot', title: '热度增量', numeric: true },
];
const tvGrowthColumns: RadarTableColumn[] = [
  { key: 'rank', title: '排序', numeric: true },
  { key: 'title', title: '短剧' },
  { key: 'hot', title: '热度', numeric: true },
  { key: 'r_hot', title: '增长率', numeric: true },
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
  let table: RadarTableRef | undefined;
  let disposed = false;
  cleanup(() => {
    disposed = true;
    table = undefined;
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
  const rows = () => props.radar.rows();
  const listed = () => !!selectedBranch() && rows().length > 0;
  const tv = props.target === 'tv';
  return (
    <View testID="radar-page" class="flex-1 min-h-0" style={{ gap: tv ? 12 : 16 }}>
      <RadarToolbar
        radar={props.radar}
        target={props.target}
        active={props.active}
        meta={dates()}
        onSource={props.onSource}
        onNavigate={props.onNavigate}
        onPrimary={props.onPrimary}
        showColumns={!tv && listed()}
        onColumns={(to) => table?.scrollColumns(to)}
      />
      <View class="gap-3" style={{ flexShrink: 0 }}>
        <If when={props.radar.error()}>
          <View class="flex-row flex-wrap items-center gap-x-4 gap-y-2">
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
          <View class="flex-row flex-wrap gap-x-4 gap-y-2">
            <If when={selectedBranch() && stale()}>
              <UiText testID="radar-stale" role="meta">
                {`显示最近成功数据${fetched() ? ` · 获取于 ${utcStampLabel(fetched())}` : ''}`}
              </UiText>
            </If>
            <If when={growthUnavailable()}>
              <UiText testID="radar-growth-status" role="meta">
                {!props.radar.data()?.growth
                  ? '飙升榜数据暂不可用，官方快照仍可查看'
                  : `飙升榜使用最近成功数据${props.radar.data()?.growth_fetched_at ? ` · 获取于 ${utcStampLabel(props.radar.data()!.growth_fetched_at)}` : ''}`}
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
          <View class="flex-row flex-wrap items-center gap-x-4 gap-y-2">
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
      </View>
      <If when={props.radar.loading() && !props.radar.data()}>
        <RadarPending target={props.target} />
      </If>
      <If when={props.radar.data() && !selectedBranch()}>
        <Notice
          testID="radar-branch-unavailable"
          message={
            props.radar.view() === 'snapshot'
              ? '官方快照暂不可用，飙升榜仍可查看'
              : '飙升榜数据暂不可用，官方快照仍可查看'
          }
        />
      </If>
      <If when={selectedBranch() && !rows().length}>
        <View
          class="flex-1 min-h-0 items-center justify-center gap-2 border-t border-border"
          style={{ paddingVertical: tv ? 32 : 48 }}
        >
          <UiText testID="radar-empty" tone="muted">
            当前分类暂无数据
          </UiText>
        </View>
      </If>
      <If when={listed()}>
        <ContentArrival class="flex-1 min-h-0">
          <RadarTable
            focusMode={props.target === 'tv' ? 'row' : 'cell'}
            columns={
              props.radar.view() === 'snapshot'
                ? tv
                  ? tvSnapshotColumns
                  : snapshotColumns
                : tv
                  ? tvGrowthColumns
                  : growthColumns
            }
            rows={rows()}
            selected={props.radar.selected()}
            pending={props.radar.pending()}
            active={props.active}
            collection={props.radar.key()}
            columnControls="external"
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
