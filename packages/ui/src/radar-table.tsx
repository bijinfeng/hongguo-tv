import {
  List,
  Scroll,
  View,
  cleanup,
  effect,
  signal,
  type ListRef,
  type ScrollRef,
  type ViewRef,
} from 'nsh';
import { Button, IconButton } from './button';
import { CardControls } from './card-controls';
import { UiText } from './display';
import { Product, controlMetrics, tvUnit } from './foundation';

export type RadarTableColumn = { key: string; title: string; numeric?: boolean };
export type RadarTableRow = { id: string; title: string; cells: Record<string, string> };
export type RadarTableRef = { restore: (id: string, owns: () => boolean) => void };

/** Controlled comparison rows. The caller owns data, selection, pending reads and navigation. */
export interface RadarTableProps {
  columns: RadarTableColumn[];
  rows: RadarTableRow[];
  selected: string;
  pending: string;
  active: boolean;
  /** A new collection resets scroll; refreshing the same collection preserves it. */
  collection?: string;
  tableRef: (ref: RadarTableRef) => void;
  onOpen: (event: { id: string }) => void;
  onSource: (event: { id: string }) => void;
  onNavigate: () => void;
}

/** A read-only comparison table; each title is the same native button on every host. */
export function RadarTable(props: RadarTableProps) {
  const product = Product();
  let list: ListRef | undefined;
  let columns: ScrollRef | undefined;
  let waiting: { id: string; owns: () => boolean } | undefined;
  const refs = new Map<string, ViewRef>();
  const viewport = signal(0);
  const offset = signal(0);
  let frame = 0;
  let disposed = false;
  const unit = (value: number) => (product === 'tv' ? tvUnit(value) : value);
  const safe = () => unit(8);
  const rowHeight = () => (product === 'tv' ? tvUnit(120) : 84);
  const headerHeight = () => (product === 'tv' ? tvUnit(72) : 48);
  const width = (column: RadarTableColumn) => {
    const wideNumber = ['hot', 'd_hot', 'd_fav', 'd7_hot', 'r_hot'].includes(column.key);
    return product === 'tv'
      ? tvUnit(
          column.key === 'title'
            ? 400
            : column.key === 'rank'
              ? 88
              : column.key === 'type'
                ? 96
                : column.key === 'streak'
                  ? 280
                  : wideNumber
                    ? 440
                    : 180,
        )
      : column.key === 'title'
        ? 240
        : column.key === 'rank'
          ? 64
          : column.key === 'type'
            ? 72
            : column.key === 'streak'
              ? 160
              : wideNumber
                ? 280
                : 136;
  };
  const contentWidth = () =>
    Math.max(
      viewport(),
      props.columns.reduce((sum, column) => sum + width(column), safe() * 2),
    );
  const scrollColumns = (x: number) => {
    const next = Math.max(0, Math.min(x, contentWidth() - viewport()));
    offset.set(next);
    columns?.scrollTo({ x: next, animated: false });
  };
  const showTitle = () => {
    let start = safe();
    for (const column of props.columns) {
      if (column.key === 'title') {
        const end = start + width(column) + safe();
        if (start - safe() < offset()) scrollColumns(start - safe());
        else if (end > offset() + viewport()) scrollColumns(end - viewport());
        break;
      }
      start += width(column);
    }
  };
  const restore = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const intent = waiting;
      if (!intent) return;
      if (disposed || !props.active || !intent.owns()) {
        waiting = undefined;
        return;
      }
      if (!props.rows.some((item) => item.id === intent.id)) {
        waiting = undefined;
        return;
      }
      const ref = refs.get(intent.id);
      if (ref) {
        waiting = undefined;
        ref.focus();
      }
    });
  };
  props.tableRef({
    restore(id, owns) {
      const index = props.rows.findIndex((item) => item.id === id);
      if (disposed || !props.active || !owns() || index < 0) return;
      waiting = { id, owns };
      showTitle();
      list?.scrollToIndex({ index, animated: false, viewPosition: 0.5, viewOffset: safe() });
      restore();
    },
  });
  let collection = props.collection;
  effect(() => {
    const next = props.collection;
    if (next === collection) return;
    collection = next;
    waiting = undefined;
    cancelAnimationFrame(frame);
    list?.scrollToOffset({ offset: 0, animated: false });
    scrollColumns(0);
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    refs.clear();
  });
  return (
    <View class="flex-1 min-h-0" style={{ padding: safe() }}>
      <View class="items-end pb-2">
        <CardControls label="表格列" onNavigate={props.onNavigate}>
          <IconButton
            testID="radar-columns-prev"
            label="显示前面的列"
            icon="back"
            variant="quiet"
            size="sm"
            onPress={() => {
              props.onNavigate();
              scrollColumns(0);
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
              scrollColumns(contentWidth());
            }}
          />
        </CardControls>
      </View>
      {/* Keep the virtual List in its own viewport; only the header owns horizontal scrolling. */}
      <View
        testID="radar-table"
        role="table"
        class="flex-1 min-h-0 min-w-0 border border-border rounded-(--radius) bg-background overflow-hidden"
        onLayout={({ bounds }) => {
          const width = Math.max(0, bounds.size.width - 2);
          if (width !== viewport()) viewport.set(width);
        }}
      >
        <Scroll
          horizontal
          ref={(ref) => {
            columns = ref;
          }}
          style={{ height: headerHeight() }}
          class="shrink-0 bg-muted border-b border-border"
          accessibilityLabel="榜单雷达列标题"
          onScroll={({ offset: current }) => {
            offset.set(current.x);
          }}
        >
          <View
            role="row"
            style={{
              width: contentWidth(),
              minHeight: headerHeight(),
              paddingHorizontal: safe(),
              paddingVertical: safe(),
            }}
            class="flex-row items-center shrink-0"
          >
            <Each of={props.columns} key={(column) => column.key}>
              {(column) => (
                <View
                  role="columnheader"
                  style={{
                    width: width(column()),
                    paddingHorizontal:
                      column().key === 'title' ? controlMetrics('sm').paddingHorizontal : unit(12),
                  }}
                  class="shrink-0"
                >
                  <UiText
                    testID={`radar-column-${column().key}`}
                    role="meta"
                    align={column().numeric ? 'end' : 'start'}
                  >
                    {column().title}
                  </UiText>
                </View>
              )}
            </Each>
          </View>
        </Scroll>
        <List
          testID="radar-rows"
          ref={(ref) => {
            list = ref;
          }}
          each={props.rows}
          keyExtractor={(item) => item.id}
          estimatedItemSize={rowHeight()}
          class="flex-1 min-h-0 min-w-0 w-full"
          accessibilityLabel="榜单雷达数据，标题可打开详情"
          onWheel={(event) => {
            const distance = event.delta.x || (event.modifiers.shift ? event.delta.y : 0);
            if (distance) {
              props.onNavigate();
              scrollColumns(offset() + distance * (event.deltaMode === 'lines' ? unit(24) : 1));
            }
          }}
          contentStyle={{ paddingTop: safe(), paddingBottom: safe() }}
          empty={
            <View style={{ padding: unit(24) }}>
              <UiText role="meta">暂无条目</UiText>
            </View>
          }
          onViewableItemsChange={() => {
            if (waiting) restore();
          }}
        >
          {(item) => {
            let ref: ViewRef | undefined;
            effect(() => {
              const id = item().id;
              if (ref) refs.set(id, ref);
              if (id === waiting?.id) restore();
              cleanup(() => {
                if (refs.get(id) === ref) refs.delete(id);
              });
            });
            return (
              <View
                role="row"
                class="w-full overflow-hidden border-b border-border"
                onLayout={() => {
                  if (waiting?.id === item().id) restore();
                }}
              >
                <View
                  style={{
                    width: contentWidth(),
                    transform: [{ translateX: -offset() }],
                    minHeight: rowHeight(),
                    paddingHorizontal: safe(),
                    paddingVertical: safe(),
                  }}
                  class="flex-row items-center"
                >
                  <Each of={props.columns} key={(column) => column.key}>
                    {(column) => (
                      <View
                        role="cell"
                        style={{
                          width: width(column()),
                          paddingHorizontal: column().key === 'title' ? 0 : unit(12),
                        }}
                        class="shrink-0"
                      >
                        <If
                          when={column().key === 'title'}
                          else={
                            <UiText
                              role={column().numeric ? 'numeric' : 'meta'}
                              tone="default"
                              align={column().numeric ? 'end' : 'start'}
                            >
                              {item().cells[column().key] ?? '—'}
                            </UiText>
                          }
                        >
                          <View class="w-full items-start">
                            <Button
                              testID={`radar-entry-${item().id}`}
                              buttonRef={(node) => {
                                ref = node;
                                refs.set(item().id, node);
                                if (waiting?.id === item().id) restore();
                              }}
                              size="sm"
                              variant="quiet"
                              label={item().title}
                              labelLines={2}
                              displayLabel={
                                props.pending === item().id ? '正在读取详情…' : undefined
                              }
                              accessibilityDescription="查看详情"
                              selected={props.selected === item().id}
                              onFocus={() => {
                                if (props.pending && props.pending !== item().id)
                                  props.onNavigate();
                                props.onSource({ id: item().id });
                              }}
                              onBlur={() => {
                                if (props.pending === item().id) props.onNavigate();
                              }}
                              onPress={() => props.onOpen({ id: item().id })}
                            />
                          </View>
                        </If>
                      </View>
                    )}
                  </Each>
                </View>
              </View>
            );
          }}
        </List>
      </View>
    </View>
  );
}
