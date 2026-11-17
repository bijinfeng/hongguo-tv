import { Text, View, reduceMotion, token } from 'nsh';
import { Pagination as BasePagination, type PaginationItemState } from 'nsh/base';
import { Icon } from './icon';
import { Product, controlMetrics, tvUnit, type ControlSize } from './foundation';

/** Hongguo's themed page navigation; paging behavior and semantics stay in `nsh/base`. */
export interface PaginationProps {
  /** The page shown, from 1. The caller owns it and follows `onChange`. */
  page: number;
  /** How many pages there are, at least 1. One page shows no pager. */
  totalPages: number;
  /** The page the user picked. The current page is never reported. */
  onChange: (event: { page: number }) => void;
  /** The most pages shown at once, first and last included, at least 5. */
  visiblePages?: number;
  /** Previous, the page in words and next only: for a narrow pane. */
  compact?: boolean;
  /** Every item is inert and reads as unavailable. */
  disabled?: boolean;
  size?: ControlSize;
  /** What the navigation is for, e.g. 目录分页. */
  accessibilityLabel?: string;
  testID?: string;
}

/** The item surface is the button: the base item keeps only focus and geometry. */
function itemSurface(item: PaginationItemState) {
  if (item.kind === 'ellipsis') return 'bg-transparent border-transparent';
  if (item.disabled) return item.current ? 'bg-muted border-border' : 'bg-muted border-transparent';
  if (item.current) return 'bg-accent border-transparent';
  return 'bg-card border-border hover:bg-muted active:bg-border';
}

/** The current page keeps its place while the whole pager is inert. */
function pageTone(item: PaginationItemState) {
  if (item.disabled) return item.current ? 'text-foreground' : 'text-muted-foreground';
  return item.current ? 'text-accent-foreground' : 'text-foreground';
}

/** A single product style for desktop and TV; the base owns range, focus and keyboard behavior. */
export function Pagination(props: PaginationProps) {
  const metrics = controlMetrics(props.size);
  const total = () => Math.max(1, Math.trunc(props.totalPages) || 1);
  const current = () => Math.min(total(), Math.max(1, Math.trunc(props.page) || 1));
  const transition = (item: PaginationItemState) =>
    reduceMotion() || item.disabled || item.current ? '' : 'transition-colors duration-100';
  return (
    <If when={total() > 1}>
      <BasePagination
        page={current()}
        totalPages={total()}
        visiblePages={props.visiblePages}
        compact={props.compact}
        disabled={props.disabled}
        accessibilityLabel={props.accessibilityLabel ?? '分页'}
        previousAccessibilityLabel="上一页"
        nextAccessibilityLabel="下一页"
        testID={props.testID}
        class="flex-row flex-wrap items-center"
        style={{ gap: metrics.gap }}
        itemClass="flex-row items-center justify-center focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
        // The item style is text-only; the content below gives the item its Button-sized box.
        itemStyle={{ fontSize: metrics.fontSize }}
        renderItem={(item) => (
          <View
            class={`flex-row items-center justify-center border ${transition(item)} ${itemSurface(item)}`}
            style={{
              height: metrics.height,
              minWidth: metrics.height,
              paddingHorizontal: props.compact ? metrics.gap : metrics.paddingHorizontal,
              borderRadius: metrics.radius,
              borderWidth: Product() === 'tv' ? tvUnit(1) : 1,
              gap: metrics.gap,
            }}
          >
            <If when={item.kind === 'ellipsis'}>
              <Text class="text-muted-foreground" accessibilityElementsHidden>
                …
              </Text>
            </If>
            <If when={item.kind === 'previous' || item.kind === 'next'}>
              <Icon
                name={item.kind === 'previous' ? 'back' : 'forward'}
                color={token(item.disabled ? 'muted-foreground' : 'foreground')}
                size={props.size}
              />
              <If when={!props.compact}>
                <Text
                  class={item.disabled ? 'text-muted-foreground' : 'text-foreground'}
                  style={{ fontSize: metrics.fontSize }}
                >
                  {item.kind === 'previous' ? '上一页' : '下一页'}
                </Text>
              </If>
            </If>
            <If when={item.kind === 'page'}>
              <Text
                class={`tabular-nums ${item.current ? 'font-semibold' : ''} ${pageTone(item)}`}
                style={{ fontSize: metrics.fontSize }}
              >
                {String(item.page)}
              </Text>
            </If>
          </View>
        )}
        onChange={props.onChange}
      >
        <If when={props.compact}>
          <Text class="tabular-nums text-muted-foreground" style={{ fontSize: metrics.fontSize }}>
            {`第 ${current()} / ${total()} 页`}
          </Text>
        </If>
      </BasePagination>
    </If>
  );
}
