import { Text, reduceMotion, token, type ViewProps, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { Icon } from './icon';
import { border, controlMetrics, weight, type ControlSize } from './foundation';
import { textLineHeightRatio } from './typography';

/** The surface the crumb sits on: an ordinary page, or the player's dark band. */
export type BackButtonTone = 'page' | 'cinema';

/**
 * The one page-level back affordance: a leading arrow and the destination's name, with no
 * resting surface. It is the first line of a page's content column, and its glyph — not its
 * hover wash — sits on the page's text axis.
 */
export interface BackButtonProps {
  /** The destination, such as `返回发现`; also the control's accessible name. */
  label: string;
  onPress: () => void;
  /** Pairs with the page by default; `cinema` keeps its text readable on the player band. */
  tone?: BackButtonTone;
  size?: ControlSize;
  disabled?: boolean;
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
  onFocus?: () => void;
  class?: string;
  /** Layout-only additions; the crumb keeps its own tone and alignment. */
  style?: ViewProps['style'];
}

export function BackButton(props: BackButtonProps) {
  const size = () => controlMetrics(props.size ?? 'sm');
  const cinema = () => props.tone === 'cinema';
  // A quiet navigation label stays one tier down on the dark band; a page keeps the foreground.
  const tone = () => {
    if (props.disabled) return cinema() ? 'cinema-muted' : 'muted-foreground';
    return cinema() ? 'cinema-muted' : 'foreground';
  };
  const wash = () =>
    cinema() ? 'hover:bg-cinema-hover active:bg-cinema-active' : 'hover:bg-muted active:bg-border';
  return (
    <CardRoot
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onFocus={props.onFocus}
      onPress={() => {
        if (!props.disabled) props.onPress();
      }}
      class={`flex-row items-center border border-transparent focus-visible:outline-2 focus-visible:outline-offset-4 ${cinema() ? 'focus-visible:outline-cinema-focus' : 'focus-visible:outline-ring'} ${props.disabled ? '' : wash()} ${props.disabled || reduceMotion() ? '' : 'transition-colors duration-100'} ${props.class ?? ''}`}
      style={{
        // A column page must not stretch the crumb's hover wash; a centered row overrides this.
        alignSelf: 'flex-start',
        minHeight: size().height,
        borderWidth: border,
        // No leading padding: the arrow itself sits on the text axis of the page below it.
        paddingLeft: 0,
        paddingRight: size().paddingHorizontal,
        paddingVertical: size().paddingVertical,
        gap: size().gap,
        borderRadius: size().radius,
        ...props.style,
      }}
    >
      <Icon name="arrow-left" color={token(tone())} size={props.size ?? 'sm'} />
      <Text
        style={{
          fontSize: size().fontSize,
          lineHeight: Math.round(size().fontSize * textLineHeightRatio('body')),
          fontWeight: weight.regular(),
          color: token(tone()),
        }}
      >
        {props.label}
      </Text>
    </CardRoot>
  );
}
