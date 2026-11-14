import { Text, reduceMotion, token, type ViewRef } from 'nsh';
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
  expanded?: boolean;
  accessibilityDescription?: string;
  icon?: IconName;
  iconOnly?: boolean;
  displayLabel?: string;
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
}

/** Styled semantic action; retains source-focus and removable-action adapters. */
export function Button(props: ButtonProps) {
  const Root = props.onFocusedRemoval ? FocusedRemovalRoot : CardRoot;
  const size = () => controlMetrics(props.size ?? (props.compact ? 'sm' : 'md'));
  const variant = () => props.variant ?? (props.primary ? 'primary' : 'default');
  const blocked = () => !!props.disabled || !!props.pending;
  const tone = () =>
    blocked()
      ? 'muted-foreground'
      : props.selected
        ? 'accent-foreground'
        : variant() === 'primary'
          ? 'primary-foreground'
          : variant() === 'destructive'
            ? 'destructive'
            : 'foreground';
  const appearance = () =>
    blocked()
      ? 'bg-muted border-transparent'
      : props.selected
        ? 'bg-accent border-transparent'
        : variant() === 'primary'
          ? 'bg-primary border-primary hover:bg-primary/90 active:bg-primary/80'
          : variant() === 'destructive'
            ? 'bg-transparent border-destructive hover:bg-accent active:bg-accent'
            : variant() === 'quiet' || variant() === 'navigation'
              ? 'bg-transparent border-transparent hover:bg-muted active:bg-muted'
              : props.episode
                ? 'bg-muted border-transparent hover:bg-accent active:bg-accent'
                : 'bg-card border-border hover:bg-muted active:bg-muted';
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
        borderRadius: size().radius,
        borderWidth: Product() === 'tv' ? tvUnit(1) : 1,
        paddingHorizontal: props.iconOnly ? size().gap : size().paddingHorizontal,
        paddingVertical: size().paddingVertical,
        gap: size().gap,
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
      expanded={props.expanded}
      accessibilityDescription={props.accessibilityDescription}
      class={`flex-row items-center ${variant() === 'navigation' && Product() === 'desktop' ? 'justify-start' : 'justify-center'} border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 ${props.selectOpen ? 'focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-4' : ''} ${reduceMotion() || blocked() || props.selected ? '' : 'transition-colors duration-100'} ${appearance()}`}
    >
      <SelectFocus open={props.selectOpen} gap={size().gap}>
        <If when={props.icon || (props.iconOnly && props.pending)}>
          <Icon
            name={props.pending && props.iconOnly ? 'loader-circle' : props.icon!}
            color={token(tone())}
            size={props.size ?? (props.compact ? 'sm' : 'md')}
          />
        </If>
        <If when={!props.iconOnly}>
          <Text
            style={{
              fontSize:
                variant() === 'navigation' && Product() === 'tv' ? tvUnit(24) : size().fontSize,
            }}
            class={`${variant() === 'primary' || props.selected ? 'font-semibold' : ''} ${blocked() ? 'text-muted-foreground' : props.selected ? 'text-accent-foreground' : variant() === 'primary' ? 'text-primary-foreground' : variant() === 'destructive' ? 'text-destructive' : 'text-foreground'}`}
          >
            {props.displayLabel ?? (props.pending ? '处理中…' : props.label)}
          </Text>
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
