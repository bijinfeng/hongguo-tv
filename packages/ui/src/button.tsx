import { Text, View, reduceMotion, token, type JSX, type ViewProps, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { FocusedRemovalRoot } from './focused-removal-root';
import { SelectFocus } from './select-focus';
import { Icon, type IconName } from './icon';
import { border, controlMetrics, space, weight, type ControlSize } from './foundation';
import { textLineHeightRatio } from './typography';

/** Limited visual hierarchy. Navigation remains a compatibility variant. */
export type ButtonVariant = 'default' | 'primary' | 'quiet' | 'destructive' | 'navigation';
/** A named action. The caller owns its pending/selected values and effects. */
export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ControlSize;
  disabled?: boolean;
  pending?: boolean;
  selected?: boolean;
  /** Marks the destination the user is already on; foreground text on a muted shared surface. */
  current?: boolean;
  expanded?: boolean;
  accessibilityDescription?: string;
  icon?: IconName;
  iconOnly?: boolean;
  /** Trailing chevron affordance for a trigger that opens a list, menu or popover. */
  dropdown?: boolean;
  /** The trigger's popup is showing; pairs its accent surface with accent-foreground. */
  popupOpen?: boolean;
  displayLabel?: string;
  /** Bound a long action label within its parent while retaining its full accessible name. */
  labelLines?: 1 | 2;
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
  /** Internal Select adapter; preserves the existing macOS keyboard boundary. */
  selectOpen?: boolean;
  onFocusedRemoval?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** @deprecated Use variant="primary". */
  primary?: boolean;
  /** @deprecated Use size="sm". */
  compact?: boolean;
  /** Compatibility composition for existing episode grids. */
  episode?: boolean | 'player';
  /** `start` aligns label and icon to the leading edge; centered otherwise. */
  align?: 'start' | 'center';
  /** Media or decorative artwork rendered by the control; the label supplies the name. */
  artwork?: JSX.Element;
  /** Layout-only additions for composed actions; the control keeps its own state colors. */
  class?: string;
  /** Layout-only spacing override, resolved after the size metrics. */
  style?: ViewProps['style'];
}

/** Episode grids need a taller target than a toolbar control; both stay on the spacing scale. */
const episodeHeights = { detail: space('3xl'), player: 42 } as const;

/** Styled semantic action; retains source-focus and removable-action adapters. */
export function Button(props: ButtonProps) {
  const Root = props.onFocusedRemoval ? FocusedRemovalRoot : CardRoot;
  const sizeName = () => props.size ?? (props.compact ? 'sm' : 'md');
  const size = () => controlMetrics(sizeName());
  const variant = () => props.variant ?? (props.primary ? 'primary' : 'default');
  const blocked = () => !!props.disabled || !!props.pending;
  // A popup trigger keeps its chevron on the trailing edge; a plain icon stays leading.
  const dropdown = () => !!props.dropdown || props.selectOpen !== undefined;
  const popupOpen = () => !blocked() && !!(props.popupOpen ?? props.selectOpen);
  // Emphasised surfaces stay paired with their foreground; the current destination is not one.
  const emphasised = () => !blocked() && !props.current;
  const selectedSurface = () => emphasised() && !!props.selected;
  const tone = () => {
    if (blocked()) return 'muted-foreground';
    if (popupOpen()) return 'accent-foreground';
    if (selectedSurface()) return 'accent-foreground';
    switch (variant()) {
      case 'primary':
        return 'primary-foreground';
      case 'destructive':
        return 'destructive';
      // Navigation reads as a rail: the current destination carries the foreground, every other
      // entry stays one tier down, as the draft's nav item does.
      case 'navigation':
        return props.current ? 'foreground' : 'muted-foreground';
      default:
        return 'foreground';
    }
  };
  const appearance = () => {
    if (blocked()) return 'bg-muted border-transparent';
    if (popupOpen()) return 'bg-accent border-transparent';
    if (props.current) {
      return variant() === 'quiet'
        ? 'bg-transparent border-transparent hover:bg-muted active:bg-border'
        : 'bg-muted border-input hover:bg-muted active:bg-border';
    }
    if (selectedSurface()) return 'bg-accent border-transparent';
    switch (variant()) {
      case 'primary':
        return 'bg-primary border-primary hover:bg-primary/90 active:bg-primary/80';
      case 'quiet':
      case 'navigation':
        return 'bg-transparent border-transparent hover:bg-muted active:bg-border';
      default:
        return 'bg-card border-input hover:bg-muted active:bg-border';
    }
  };
  const height = () =>
    props.episode
      ? props.episode === 'player'
        ? episodeHeights.player
        : episodeHeights.detail
      : size().height;
  const strongLabel = () => !!props.selected || !!props.current || variant() === 'primary';
  return (
    <Root
      ref={(ref) => props.buttonRef?.(ref)}
      style={{
        minHeight: height(),
        minWidth: props.iconOnly ? size().height : undefined,
        maxWidth: props.labelLines ? '100%' : undefined,
        borderRadius: size().radius,
        borderWidth: border,
        paddingHorizontal: props.iconOnly ? size().gap : size().paddingHorizontal,
        paddingVertical: size().paddingVertical,
        gap: size().gap,
        ...props.style,
      }}
      testID={props.testID}
      accessibilityLabel={props.pending ? `${props.label}，处理中` : props.label}
      onPress={() => {
        if (!blocked()) props.onPress();
      }}
      onFocusedRemoval={props.onFocusedRemoval}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      disabled={blocked()}
      selected={props.selected}
      current={props.current}
      expanded={props.expanded}
      accessibilityDescription={props.accessibilityDescription}
      class={`flex-row items-center ${dropdown() ? 'justify-between' : props.align === 'start' ? 'justify-start' : 'justify-center'} border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 ${props.selectOpen ? 'focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-4' : ''} ${reduceMotion() || blocked() || props.selected ? '' : 'transition-colors duration-100'} ${appearance()} ${props.class ?? ''}`}
    >
      <SelectFocus
        open={props.selectOpen}
        gap={size().gap}
        stretch={props.selectOpen !== undefined}
      >
        <If when={props.artwork && props.selectOpen === undefined}>{props.artwork}</If>
        <If
          when={
            !props.artwork && ((props.icon && !dropdown()) || (props.iconOnly && props.pending))
          }
        >
          <Icon
            name={props.pending && props.iconOnly ? 'loader-circle' : props.icon!}
            color={token(tone())}
            size={sizeName()}
          />
        </If>
        <If when={!props.iconOnly && (props.artwork ? !!props.displayLabel : true)}>
          <Text
            style={{
              fontSize: size().fontSize,
              // The type scale's 1.5 ratio, so a label sits on the control's centre line: with
              // `normal` metrics the text box lands one point high inside a fixed-height control.
              lineHeight: Math.round(size().fontSize * textLineHeightRatio('body')),
              fontWeight: strongLabel() ? weight.strong() : weight.regular(),
              color: token(tone()),
              flexShrink: dropdown() || props.labelLines ? 1 : undefined,
              numberOfLines: props.labelLines ?? 0,
            }}
          >
            {props.displayLabel ?? (props.pending ? '处理中…' : props.label)}
          </Text>
        </If>
        <If when={dropdown()}>
          {/* The chevron is a secondary affordance; the value text keeps the foreground. */}
          <View
            class={reduceMotion() ? '' : 'transition-transform duration-150'}
            style={{ transform: [{ rotate: popupOpen() ? 180 : 0 }] }}
          >
            <Icon
              name={props.icon ?? 'down'}
              color={token(popupOpen() ? 'accent-foreground' : 'muted-foreground')}
              size={sizeName()}
            />
          </View>
        </If>
      </SelectFocus>
    </Root>
  );
}

/** A square action with a required readable label. */
export function IconButton(
  props: Omit<ButtonProps, 'iconOnly' | 'displayLabel' | 'icon'> & { icon: IconName },
) {
  return <Button {...props} iconOnly />;
}
