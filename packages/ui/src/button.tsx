import { Text, reduceMotion, token, type JSX, type ViewProps, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { FocusedRemovalRoot } from './focused-removal-root';
import { SelectFocus } from './select-focus';
import { Icon, type IconName } from './icon';
import { Product, controlMetrics, tvUnit, type ControlSize } from './foundation';

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
  /** Media or decorative artwork rendered by the control; the label supplies the name. */
  artwork?: JSX.Element;
  /** Layout-only additions for composed actions; the control keeps its own state colors. */
  class?: string;
  /** Layout-only spacing override, resolved after the size metrics. */
  style?: ViewProps['style'];
}

/** Styled semantic action; retains source-focus and removable-action adapters. */
export function Button(props: ButtonProps) {
  const Root = props.onFocusedRemoval ? FocusedRemovalRoot : CardRoot;
  const size = () => controlMetrics(props.size ?? (props.compact ? 'sm' : 'md'));
  const variant = () => props.variant ?? (props.primary ? 'primary' : 'default');
  const blocked = () => !!props.disabled || !!props.pending;
  // Emphasised surfaces stay paired with their foreground; the current destination is not one.
  const emphasised = () => !blocked() && !props.current;
  const tone = () =>
    blocked()
      ? 'muted-foreground'
      : emphasised() && props.selected
        ? 'accent-foreground'
        : variant() === 'primary'
          ? 'primary-foreground'
          : variant() === 'destructive'
            ? 'destructive'
            : 'foreground';
  const selectedSurface = () => emphasised() && props.selected;
  const appearance = () =>
    blocked()
      ? 'bg-muted border-transparent'
      : props.current
        ? variant() === 'quiet'
          ? 'bg-transparent border-transparent hover:bg-muted active:bg-border'
          : 'bg-muted border-input hover:bg-muted active:bg-border'
        : selectedSurface()
          ? 'bg-accent border-transparent'
          : variant() === 'primary'
            ? 'bg-primary border-primary hover:bg-primary/90 active:bg-primary/80'
            : variant() === 'destructive'
              ? 'bg-card border-input hover:bg-muted active:bg-border'
              : variant() === 'quiet' || variant() === 'navigation'
                ? 'bg-transparent border-transparent hover:bg-muted active:bg-border'
                : props.episode
                  ? 'bg-card border-input hover:bg-muted active:bg-border'
                  : props.selectOpen !== undefined
                    ? 'bg-card border-input hover:bg-muted active:bg-border'
                    : 'bg-card border-input hover:bg-muted active:bg-border';
  return (
    <Root
      ref={(ref) => props.buttonRef?.(ref)}
      style={{
        minHeight: props.episode
          ? Product() === 'tv'
            ? tvUnit(80)
            : props.episode === 'player'
              ? 42
              : 48
          : size().height,
        minWidth: props.iconOnly ? size().height : undefined,
        maxWidth: props.labelLines ? '100%' : undefined,
        borderRadius: size().radius,
        borderWidth: Product() === 'tv' ? tvUnit(1) : 1,
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
      class={`flex-row items-center ${variant() === 'navigation' && Product() === 'desktop' ? 'justify-start' : 'justify-center'} border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 ${props.selectOpen ? 'focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-4' : ''} ${reduceMotion() || blocked() || props.selected ? '' : 'transition-colors duration-100'} ${appearance()} ${props.class ?? ''}`}
    >
      <SelectFocus
        open={props.selectOpen}
        gap={size().gap}
        stretch={props.selectOpen !== undefined}
      >
        <If when={props.artwork && props.selectOpen === undefined}>{props.artwork}</If>
        <If
          when={
            !props.artwork &&
            ((props.icon && props.selectOpen === undefined) || (props.iconOnly && props.pending))
          }
        >
          <Icon
            name={props.pending && props.iconOnly ? 'loader-circle' : props.icon!}
            color={token(tone())}
            size={props.size ?? (props.compact ? 'sm' : 'md')}
          />
        </If>
        <If when={!props.iconOnly && (props.artwork ? !!props.displayLabel : true)}>
          <Text
            style={{
              fontSize:
                variant() === 'navigation' && Product() === 'tv' ? tvUnit(24) : size().fontSize,
              flexShrink: props.selectOpen !== undefined || props.labelLines ? 1 : undefined,
              numberOfLines: props.labelLines ?? 0,
            }}
            class={`${variant() === 'primary' || props.selected || props.current ? 'font-semibold' : ''} ${blocked() ? 'text-muted-foreground' : selectedSurface() ? 'text-accent-foreground' : variant() === 'primary' ? 'text-primary-foreground' : variant() === 'destructive' ? 'text-destructive' : 'text-foreground'}`}
          >
            {props.displayLabel ?? (props.pending ? '处理中…' : props.label)}
          </Text>
        </If>
        <If when={props.icon && props.selectOpen !== undefined}>
          {/* The Select chevron is a secondary affordance; the value text keeps the foreground. */}
          <Icon name={props.icon!} color={token('muted-foreground')} size={props.size ?? 'md'} />
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
