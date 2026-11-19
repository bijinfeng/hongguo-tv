import { Text, View, reduceMotion, token, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { Cover } from './content';
import { Avatar, UiText } from './display';
import { controlMetrics, space, border } from './foundation';
import { Icon } from './icon';
import { motionTokens } from './motion';
import { textLineHeight, textSize, textWeight } from './typography';

/** One caller-owned ranking entry; the component never derives a position or fetches content. */
export interface RankingCardProps {
  /** Visible identity, retained in full in the accessible action name. */
  title: string;
  /** Public image URL; missing and failed images retain the readable identity. */
  cover?: string;
  /** Optional description under the identity; the draft clamps it to two lines. */
  subtitle?: string;
  /** Optional source-provided context shown on the title line, e.g. category and tone. */
  metadata?: string;
  /** A real positive integer rank; missing or invalid positions are omitted. */
  rank?: number;
  /** Actors use the shared Avatar; drama entries use the shared Cover. */
  kind?: 'actor' | 'drama';
  /** Controlled selection is independent of keyboard focus. */
  selected: boolean;
  /** Visible action text and the last part of the accessible action name. */
  actionLabel: string;
  /** `inline` stacks the action under the copy, as the ranking draft draws it; `none` leaves
   * the whole row as the only affordance and keeps the action in the accessible name. */
  actionPlacement?: 'trailing' | 'inline' | 'none';
  /** Row geometry only: the compact recipe suits dense surfaces and smaller viewports. */
  density?: 'regular' | 'compact';
  /** Stable identity for input adapters and acceptance selectors. */
  testID: string;
  /** Exposes the whole-row input target for source-focus restoration. */
  buttonRef: (ref: ViewRef) => void;
  /** Reports focus without activating or changing selection. */
  onFocus?: () => void;
  /** Reports one activation; navigation and business effects belong to the caller. */
  onPress: () => void;
}

/** The draft's row rhythm: 20 between lanes, 22 above and below the pair. */
const rows = {
  regular: { lane: 42, cover: 86, height: 116, gap: 20, padding: 22, radius: 8 },
  compact: { lane: 36, cover: 70, height: 94, gap: 12, padding: 14, radius: 6 },
} as const;

/** The copy never shrinks below its own two-line description, so the row's height follows it. */
const MIN_ROW_HEIGHT = { regular: 156, compact: 118 } as const;

/**
 * Ranked media row with one input target and shared pointer, keyboard and remote behavior.
 * Geometry follows the ranking draft: a rank lane, a poster, copy, then the action.
 */
export function RankingCard(props: RankingCardProps) {
  const rank = () =>
    props.rank !== undefined && Number.isInteger(props.rank) && props.rank > 0
      ? props.rank
      : undefined;
  const row = () => rows[props.density ?? 'regular'];
  const inline = () => props.actionPlacement === 'inline';
  const subtitleTone = () => (props.selected ? 'selected' : 'muted');
  const action = () => (
    <View class="flex-row items-center shrink-0" style={{ gap: controlMetrics().gap }}>
      <UiText role="body" tone={props.selected ? 'selected' : 'default'}>
        {props.actionLabel}
      </UiText>
      <Icon name="forward" color={token(props.selected ? 'accent-foreground' : 'foreground')} />
    </View>
  );
  return (
    <CardRoot
      ref={(ref) => props.buttonRef(ref)}
      testID={props.testID}
      accessibilityLabel={`${rank() === undefined ? '' : `第${rank()}名，`}${props.title}，${props.actionLabel}`}
      accessibilityDescription={
        [props.subtitle, props.metadata].filter(Boolean).join('，') || undefined
      }
      selected={props.selected}
      onFocus={props.onFocus}
      onPress={props.onPress}
      class={`flex-row items-center border-t-transparent border-b-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 ${props.selected ? 'bg-accent' : 'bg-transparent hover:bg-muted active:bg-border'}`}
      style={{
        minHeight: MIN_ROW_HEIGHT[props.density ?? 'regular'],
        paddingVertical: row().padding,
        gap: row().gap,
        borderTopWidth: 0,
        borderRightWidth: 0,
        borderBottomWidth: border,
        borderLeftWidth: 0,
        transitionProperty: 'colors',
        transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
      }}
    >
      {/* The lane exists only when the source supplied a real position: an empty lane would read as
          a missing datum and would push the poster off the row's leading edge. */}
      <If when={rank() !== undefined}>
        <View
          accessibilityElementsHidden
          class="shrink-0 items-center"
          style={{ minWidth: row().lane }}
        >
          <Text
            class="tabular-nums"
            style={{
              fontSize: textSize('section'),
              lineHeight: textLineHeight('section'),
              fontWeight: textWeight('numeric'),
              color: token(
                props.selected
                  ? 'accent-foreground'
                  : // `primary` at 24px/400 measures 2.73:1 on white, under the 3:1 large-text bar;
                    // `primary-strong` keeps the same accent read at 3.3:1.
                    rank() === 1
                    ? 'primary-strong'
                    : 'muted-foreground',
              ),
            }}
          >
            {String(rank())}
          </Text>
        </View>
      </If>
      <View accessibilityElementsHidden class="shrink-0" style={{ width: row().cover }}>
        <If
          when={props.kind === 'actor'}
          else={
            <View
              style={{
                height: row().height,
                borderRadius: row().radius,
                overflow: 'hidden',
              }}
            >
              <Cover src={props.cover} title={props.title} height={row().height} class="w-full" />
            </View>
          }
        >
          {/* The avatar stays in the poster lane so actor and drama rows share one copy spine. */}
          <View class="items-center justify-center" style={{ height: row().height }}>
            <Avatar src={props.cover} name={props.title} size="lg" accessibilityLabel="" />
          </View>
        </If>
      </View>
      <View class="flex-1" style={{ gap: space('xs') }}>
        <View
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            columnGap: space('sm'),
            rowGap: space('xxs'),
          }}
        >
          <Text
            style={{
              flexShrink: 1,
              fontSize: textSize('title'),
              lineHeight: textLineHeight('title'),
              fontWeight: textWeight('title'),
              color: token(props.selected ? 'accent-foreground' : 'foreground'),
              numberOfLines: 2,
            }}
          >
            {props.title}
          </Text>
          <If when={props.metadata}>
            <UiText role="meta" tone={subtitleTone()} lines={1}>
              {props.metadata}
            </UiText>
          </If>
        </View>
        <If when={props.subtitle}>
          <UiText role="meta" tone={subtitleTone()} lines={2}>
            {props.subtitle}
          </UiText>
        </If>
        <If when={inline()}>
          <View class="flex-row items-center" style={{ paddingTop: space('xxs') }}>
            {action()}
          </View>
        </If>
      </View>
      <If when={!inline() && props.actionPlacement !== 'none'}>{action()}</If>
    </CardRoot>
  );
}
