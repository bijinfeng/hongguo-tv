import { Text, View, reduceMotion, token, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { Cover } from './content';
import { Avatar, UiText } from './display';
import { Product, controlMetrics, tvUnit } from './foundation';
import { Icon } from './icon';
import { motionTokens } from './motion';
import { textSize } from './typography';

/** One caller-owned ranking entry; the component never derives a position or fetches content. */
export interface RankingCardProps {
  /** Visible identity, retained in full in the accessible action name. */
  title: string;
  /** Public image URL; missing and failed images retain the readable identity. */
  cover?: string;
  /** Optional secondary identity or category supplied by the caller. */
  subtitle?: string;
  /** Optional source-provided context; absent values stay absent. */
  metadata?: string;
  /** A real positive integer rank; missing or invalid positions are omitted. */
  rank?: number;
  /** Actors use the shared Avatar; drama entries use the shared Cover. */
  kind?: 'actor' | 'drama';
  /** Controlled selection is independent of keyboard focus. */
  selected: boolean;
  /** Visible action text and the last part of the accessible action name. */
  actionLabel: string;
  /** Stable identity for input adapters and acceptance selectors. */
  testID: string;
  /** Exposes the whole-row input target for source-focus restoration. */
  buttonRef: (ref: ViewRef) => void;
  /** Reports focus without activating or changing selection. */
  onFocus?: () => void;
  /** Reports one activation; navigation and business effects belong to the caller. */
  onPress: () => void;
}

/** Ranked media row with one input target and shared pointer, keyboard and remote behavior. */
export function RankingCard(props: RankingCardProps) {
  const rank = () =>
    props.rank !== undefined && Number.isInteger(props.rank) && props.rank > 0
      ? props.rank
      : undefined;
  const unit = (desktop: number, tv = desktop) => (Product() === 'tv' ? tvUnit(tv) : desktop);
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
      class={`flex-row items-center border border-transparent border-b-border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 active:opacity-80 ${props.selected ? 'bg-accent' : 'bg-transparent hover:bg-muted active:bg-muted'}`}
      style={{
        paddingVertical: unit(20, 28),
        gap: unit(20, 28),
        borderRadius: controlMetrics().radius,
        borderWidth: unit(1),
        transitionProperty: 'colors',
        transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
      }}
    >
      <View
        accessibilityElementsHidden
        class="shrink-0 items-center"
        style={{ minWidth: unit(32) }}
      >
        <If when={rank() !== undefined}>
          <Text
            class={`tabular-nums text-center ${props.selected ? 'text-accent-foreground' : 'text-foreground'}`}
            style={{
              fontSize: textSize('section'),
              lineHeight: textSize('section') * 1.5,
            }}
          >
            {String(rank())}
          </Text>
        </If>
      </View>
      <View accessibilityElementsHidden class="shrink-0">
        <If
          when={props.kind === 'actor'}
          else={
            <View style={{ width: unit(64, 96) }}>
              <Cover src={props.cover} title={props.title} height={unit(86, 128)} />
            </View>
          }
        >
          <Avatar src={props.cover} name={props.title} size="lg" accessibilityLabel="" />
        </If>
      </View>
      <View class="flex-1 min-w-0" style={{ gap: unit(6) }}>
        <Text
          class={`font-semibold ${props.selected ? 'text-accent-foreground' : 'text-foreground'}`}
          style={{
            fontSize: textSize('body'),
            lineHeight: textSize('body') * 1.5,
            numberOfLines: 2,
          }}
        >
          {props.title}
        </Text>
        <If when={props.subtitle}>
          <UiText role="meta" tone={props.selected ? 'selected' : 'muted'} lines={2}>
            {props.subtitle}
          </UiText>
        </If>
        <If when={props.metadata}>
          <UiText role="meta" tone={props.selected ? 'selected' : 'muted'} lines={2}>
            {props.metadata}
          </UiText>
        </If>
      </View>
      <View class="flex-row items-center shrink-0" style={{ gap: controlMetrics().gap }}>
        <UiText role="body" tone={props.selected ? 'selected' : 'default'}>
          {props.actionLabel}
        </UiText>
        <Icon name="forward" color={token(props.selected ? 'accent-foreground' : 'foreground')} />
      </View>
    </CardRoot>
  );
}
