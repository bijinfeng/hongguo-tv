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
import { controlMetrics, space } from './foundation';
import { ChevronLeft, ChevronRight } from 'nsh-icon-lucide';

export type RadarTableColumn = { key: string; title: string; numeric?: boolean };
export type RadarTableRow = { id: string; title: string; cells: Record<string, string> };
export type RadarTableRef = {
  restore: (id: string, owns: () => boolean) => void;
  /** Move the visible column window; the caller owns where the column controls live. */
  scrollColumns: (to: 'start' | 'end') => void;
};

/** Controlled comparison rows. The caller owns data, selection, pending reads and navigation. */
export interface RadarTableProps {
  columns: RadarTableColumn[];
  rows: RadarTableRow[];
  selected: string;
  pending: string;
  active: boolean;
  /** A new collection resets scroll; refreshing the same collection preserves it. */
  collection?: string;
  /**
   * The column the rows are ordered by. A collection change scrolls this column into view instead
   * of resetting to the left edge, so the sorted values are the ones the reader sees.
   */
  focusColumn?: string;
  /**
   * `header` renders the column controls above the table (previews and most callers).
   * `external` lets the page compose them in its own control band.
   */
  columnControls?: 'header' | 'external';
  /**
   * `cell` keeps the title as the row action and lets a pointer scroll columns.
   * `row` makes the whole row one focus stop so a d-pad never enters a cell grid.
   */
  focusMode?: 'cell' | 'row';
  tableRef: (ref: RadarTableRef) => void;
  onOpen: (event: { id: string }) => void;
  onSource: (event: { id: string }) => void;
  onNavigate: () => void;
}

/**
 * A read-only comparison table. Desktop keeps the title as the row action; TV makes the whole
 * row one focusable action so a d-pad never has to enter a table cell grid.
 */
export function RadarTable(props: RadarTableProps) {
  const row = props.focusMode === 'row';
  let list: ListRef | undefined;
  let columns: ScrollRef | undefined;
  let waiting: { id: string; owns: () => boolean } | undefined;
  const refs = new Map<string, ViewRef>();
  const viewport = signal(0);
  const offset = signal(0);
  let frame = 0;
  let disposed = false;
  const safe = () => space('xs');
  const rowHeight = () => 84;
  const headerHeight = () => space('3xl');
  /**
   * Surplus follows the longest values: absolute heat and its increment carry full-precision
   * service integers, so they take the most; secondary deltas give way.
   */
  const weight = (column: RadarTableColumn) => {
    switch (column.key) {
      case 'title':
        return 2.6;
      case 'rank':
        return 0.5;
      case 'type':
        return 0.6;
      case 'delta':
        return 1.2;
      case 'streak':
        return 1.4;
      case 'hot':
      case 'd_hot':
        return 2.4;
      case 'r_hot':
        return 1.2;
      case 'd_fav':
        return 1.6;
      case 'd7_hot':
        return 1.4;
      default:
        return 1.6;
    }
  };
  /**
   * A weight share alone can leave a header or a grouped number narrower than its own text, and
   * a clipped number is useless in a comparison table. The floor is the cell's whole box, side
   * insets included, so the text it is measured for actually fits; only surplus is shared.
   */
  const cellInset = () => space('sm') * 2;
  const minWidth = (column: RadarTableColumn) =>
    cellInset() +
    (column.key === 'rank'
      ? 30
      : column.key === 'type'
        ? 44
        : column.key === 'title'
          ? 96
          : column.numeric
            ? 96
            : 64);
  /**
   * Both modes share the viewport: each column takes its measured floor and the surplus is
   * shared by weight. Fixed desktop widths added up to more than the content column, so the table
   * scrolled and hid whichever column was sorted by; floors always fit, so it no longer does.
   */
  const widths = () => {
    const map = new Map<string, number>();
    const available = Math.max(0, viewport() - safe() * 2);
    const floors = props.columns.map(minWidth);
    const floorTotal = floors.reduce((sum, value) => sum + value, 0);
    const surplus = Math.max(0, available - floorTotal);
    const total = props.columns.reduce((sum, column) => sum + weight(column), 0) || 1;
    let used = 0;
    props.columns.forEach((column, index) => {
      const last = index === props.columns.length - 1;
      const width = last
        ? Math.max(0, available - used)
        : floors[index] + Math.floor((surplus * weight(column)) / total);
      map.set(column.key, width);
      used += width;
    });
    return map;
  };
  const contentWidth = () =>
    Math.max(
      viewport(),
      props.columns.reduce((sum, column) => sum + minWidth(column), 0) + safe() * 2,
    );
  const scrollColumns = (x: number) => {
    if (row) {
      offset.set(0);
      return;
    }
    const next = Math.max(0, Math.min(x, contentWidth() - viewport()));
    offset.set(next);
    columns?.scrollTo({ x: next, animated: false });
  };
  const showTitle = () => {
    if (row) return;
    let start = safe();
    for (const column of props.columns) {
      const width = widths().get(column.key) ?? 0;
      if (column.key === 'title') {
        const end = start + width + safe();
        if (start - safe() < offset()) scrollColumns(start - safe());
        else if (end > offset() + viewport()) scrollColumns(end - viewport());
        break;
      }
      start += width;
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
    scrollColumns(to) {
      scrollColumns(to === 'start' ? 0 : contentWidth());
    },
  });
  let collection = props.collection;
  /**
   * Horizontal offset that brings `key` into view while the row identity stays on screen. The
   * board can be wider than the window, so the two cannot always both fit; the identity (rank and
   * title) wins and the sorted column is only scrolled as far as that block allows.
   */
  const offsetForColumn = (key: string | undefined) => {
    if (!key) return 0;
    let start = safe();
    let identityEnd = safe();
    for (const column of props.columns) {
      const width = widths().get(column.key) ?? 0;
      if (column.key === 'rank' || column.key === 'title') identityEnd = start + width + safe();
      if (column.key === key) {
        const end = start + width + safe();
        if (end <= viewport()) return 0;
        return Math.min(end - viewport(), identityEnd);
      }
      start += width;
    }
    return 0;
  };
  effect(() => {
    const next = props.collection;
    if (next === collection) return;
    collection = next;
    waiting = undefined;
    cancelAnimationFrame(frame);
    list?.scrollToOffset({ offset: 0, animated: false });
    scrollColumns(offsetForColumn(props.focusColumn));
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    refs.clear();
  });
  const tone = (column: RadarTableColumn, value: string) => {
    if (column.key === 'type' || column.key === 'streak') return 'muted' as const;
    if (column.key === 'delta' && (value.startsWith('下降') || value === '持平'))
      return 'muted' as const;
    if (column.key === 'rank' && value === '1') return 'selected' as const;
    return 'default' as const;
  };
  const header = () => (
    <Scroll
      horizontal
      ref={(ref) => {
        columns = ref;
      }}
      style={{ height: headerHeight() }}
      class="shrink-0 border-b border-border"
      accessibilityLabel="榜单雷达列标题"
      onScroll={({ offset: current }) => {
        if (!row) offset.set(current.x);
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
                width: widths().get(column().key) ?? 0,
                paddingHorizontal:
                  column().key === 'title' ? controlMetrics('sm').paddingHorizontal : space('sm'),
              }}
              class="shrink-0"
            >
              <UiText
                testID={`radar-column-${column().key}`}
                role="meta"
                align={column().numeric ? 'end' : 'start'}
                lines={1}
              >
                {column().title}
              </UiText>
            </View>
          )}
        </Each>
      </View>
    </Scroll>
  );
  const desktopRow = (item: () => RadarTableRow) => {
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
                  width: widths().get(column().key) ?? 0,
                  paddingHorizontal: column().key === 'title' ? 0 : space('sm'),
                }}
                class="shrink-0"
              >
                <If
                  when={column().key === 'title'}
                  else={
                    <UiText
                      role={column().numeric ? 'numeric' : 'meta'}
                      tone={tone(column(), item().cells[column().key] ?? '—')}
                      align={column().numeric ? 'end' : 'start'}
                      lines={1}
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
                      displayLabel={props.pending === item().id ? '正在读取详情…' : undefined}
                      accessibilityDescription="查看详情"
                      selected={props.selected === item().id}
                      onFocus={() => {
                        if (props.pending && props.pending !== item().id) props.onNavigate();
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
  };
  const rowAction = (item: () => RadarTableRow) => {
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
          accessibilityDescription="查看详情"
          selected={props.selected === item().id}
          class="w-full justify-start"
          style={{
            width: '100%',
            minHeight: rowHeight(),
            borderRadius: 0,
            paddingHorizontal: 0,
            paddingVertical: 0,
          }}
          artwork={
            <View
              class="flex-row items-center"
              style={{
                width: '100%',
                minHeight: rowHeight(),
                paddingHorizontal: safe(),
                paddingVertical: safe(),
              }}
            >
              <Each of={props.columns} key={(column) => column.key}>
                {(column) => (
                  <View
                    role="cell"
                    style={{
                      width: widths().get(column().key) ?? 0,
                      paddingHorizontal: space('sm'),
                    }}
                    class="shrink-0"
                  >
                    <If
                      when={column().key === 'title'}
                      else={
                        // A value wider than its column shrinks to fit instead of gaining an ellipsis: a comparison
                        // table whose numbers cannot be read is decorative, and the caller passes the
                        // exact service value, which must stay whole.
                        <UiText
                          role={column().numeric ? 'numeric' : 'meta'}
                          tone={tone(column(), item().cells[column().key] ?? '—')}
                          align={column().numeric ? 'end' : 'start'}
                          lines={1}
                        >
                          {item().cells[column().key] ?? '—'}
                        </UiText>
                      }
                    >
                      <UiText role="body" lines={1}>
                        {props.pending === item().id ? '正在读取详情…' : item().title}
                      </UiText>
                    </If>
                  </View>
                )}
              </Each>
            </View>
          }
          onFocus={() => {
            if (props.pending && props.pending !== item().id) props.onNavigate();
            props.onSource({ id: item().id });
          }}
          onBlur={() => {
            if (props.pending === item().id) props.onNavigate();
          }}
          onPress={() => props.onOpen({ id: item().id })}
        />
      </View>
    );
  };
  return (
    <View class="flex-1 min-h-0">
      <If when={props.columnControls !== 'external'}>
        <View class="items-end pb-2">
          <CardControls label="表格列" onNavigate={props.onNavigate}>
            <IconButton
              testID="radar-columns-prev"
              label="显示前面的列"
              icon={ChevronLeft}
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
              icon={ChevronRight}
              variant="quiet"
              size="sm"
              onPress={() => {
                props.onNavigate();
                scrollColumns(contentWidth());
              }}
            />
          </CardControls>
        </View>
      </If>
      {/* Keep the virtual List in its own viewport; only the header owns horizontal scrolling. */}
      <View
        testID="radar-table"
        role="table"
        class="flex-1 min-h-0 min-w-0 border-t border-border overflow-hidden"
        onLayout={({ bounds }) => {
          const width = Math.max(0, bounds.size.width);
          if (width !== viewport()) viewport.set(width);
        }}
      >
        {header()}
        <List
          testID="radar-rows"
          ref={(ref) => {
            list = ref;
          }}
          each={props.rows}
          keyExtractor={(item) => item.id}
          estimatedItemSize={rowHeight()}
          class="flex-1 min-h-0 min-w-0 w-full"
          accessibilityLabel={
            row ? '榜单雷达数据，每一行可打开详情' : '榜单雷达数据，标题可打开详情'
          }
          onWheel={(event) => {
            if (row) return;
            const distance = event.delta.x || (event.modifiers.shift ? event.delta.y : 0);
            if (distance) {
              props.onNavigate();
              scrollColumns(offset() + distance * (event.deltaMode === 'lines' ? space('lg') : 1));
            }
          }}
          contentStyle={{ paddingTop: safe(), paddingBottom: safe() }}
          empty={
            <View style={{ padding: space('lg') }}>
              <UiText role="meta">暂无条目</UiText>
            </View>
          }
          onViewableItemsChange={() => {
            if (waiting) restore();
          }}
        >
          {(item) => (row ? rowAction(item) : desktopRow(item))}
        </List>
      </View>
    </View>
  );
}
