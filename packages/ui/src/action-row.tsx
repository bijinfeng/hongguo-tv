import { ChevronRight } from 'nsh-icon-lucide';
import { Text, View, reduceMotion, token, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { Icon } from './icon';
import { border, controlMetrics, space, focusRingClass } from './foundation';
import { motionTokens } from './motion';
import { textLineHeight, textSize, textWeight } from './typography';

/**
 * One destination or command drawn across the full row: the name on the leading edge, a
 * chevron on the trailing edge. The row is the only input target; there is no inner action.
 */
export interface ActionRowProps {
  /** Visible name; also the row's accessible action name. */
  label: string;
  /** Optional second line under the name; read as the action's description. */
  description?: string;
  /** Trailing glyph; defaults to the forward chevron navigation rows draw. */
  trailingIcon?: string;
  /** Draws the hairline that separates this row from the one above it. */
  divided?: boolean;
  disabled?: boolean;
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
  onFocus?: () => void;
  onPress: () => void;
}

/** The design draft's list row: 54 on desktop, taller only as the density token grows. */
/** A row with a description carries two text lines, so its minimum follows the content. */
const rowHeight = () => controlMetrics().height + space('sm');
const rowMinHeight = () => rowHeight();

/** Full-row navigation or command target with shared hover, disabled and focus treatment. */
export function ActionRow(props: ActionRowProps) {
  return (
    <CardRoot
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      accessibilityDescription={props.description}
      disabled={props.disabled}
      onFocus={props.onFocus}
      onPress={() => props.onPress()}
      class={`w-full flex-row items-center justify-between ${focusRingClass(4)} ${props.disabled ? '' : 'hover:bg-muted active:bg-border'}`}
      style={{
        minHeight: props.description ? undefined : rowMinHeight(),
        paddingVertical: props.description ? space('sm') : 0,
        gap: space('sm'),
        borderTopWidth: props.divided ? border : 0,
        borderTopColor: token('border'),
        transitionProperty: 'colors',
        transitionDuration: reduceMotion() || props.disabled ? 0 : motionTokens.fast,
      }}
    >
      <View class="flex-1 min-w-0" style={{ gap: space('xxs') }}>
        <Text
          style={{
            fontSize: textSize('body'),
            lineHeight: textLineHeight('body'),
            fontWeight: textWeight('body'),
            color: token(props.disabled ? 'muted-foreground' : 'foreground'),
          }}
        >
          {props.label}
        </Text>
        <If when={props.description}>
          <Text
            style={{
              fontSize: textSize('meta'),
              lineHeight: textLineHeight('meta'),
              fontWeight: textWeight('meta'),
              color: token('muted-foreground'),
            }}
          >
            {props.description}
          </Text>
        </If>
      </View>
      <Icon icon={props.trailingIcon ?? ChevronRight} tone="muted-foreground" size="sm" />
    </CardRoot>
  );
}
