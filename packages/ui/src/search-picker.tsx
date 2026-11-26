import {
  Overlay,
  platform,
  Scroll,
  Text,
  token,
  View,
  createMotion,
  reduceMotion,
  type JSX,
  type ViewRef,
} from 'nsh';
import { CardControls, CardRoot } from './card-controls';
import { Icon } from './icon';
import { border, focusRing, radius, space, weight } from './foundation';
import { motionTokens } from './motion';
import { textSize, textWeight } from './typography';

/** Enough rows to scan before the list itself scrolls. */
const SUGGESTION_MAX_HEIGHT = 360;

/** Anchored, nonmodal: editing remains in the input until the user moves to a row. */
export function SearchPicker(props: {
  anchor?: ViewRef;
  width: number;
  onDismiss: () => void;
  onCancel: () => void;
  onNavigate: () => void;
  onInput: () => void;
  children?: JSX.Element;
}) {
  const motion = createMotion({
    enter: {
      keyframes: { opacity: [0, 1] },
      duration: reduceMotion() ? 0 : motionTokens.fast,
      easing: 'easeOut',
    },
  });
  return (
    <Overlay
      anchor={props.anchor}
      placement="bottom"
      align="start"
      offset={8}
      margin={12}
      onPressOutside={props.onDismiss}
      onCancel={props.onCancel}
    >
      <View
        testID="search-suggestions"
        style={{
          ...motion.style,
          width: props.width,
          maxHeight: SUGGESTION_MAX_HEIGHT,
          padding: space('xs'),
          borderRadius: radius('xl'),
          borderWidth: border,
        }}
        class="border-border bg-card"
      >
        <Scroll
          testID="focus-surface-search-suggestions"
          class="shrink"
          contentStyle={{ width: '100%' }}
        >
          <CardControls
            label="搜索建议"
            onNavigate={props.onNavigate}
            vertical
            gap={space('xxs')}
            onPreviousFromFirst={props.onInput}
          >
            {props.children}
          </CardControls>
        </Scroll>
      </View>
    </Overlay>
  );
}
export function SearchSuggestionRow(props: {
  label: string;
  meta?: string;
  icon: string;
  testID: string;
  rowRef: (ref: ViewRef) => void;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
}) {
  return (
    <CardRoot
      ref={(ref) => props.rowRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      onPress={props.onPress}
      style={{
        minHeight: space('3xl'),
        paddingHorizontal: space('sm'),
        paddingVertical: space('xs'),
        gap: space('sm'),
        borderRadius: radius('xl'),
        borderWidth: focusRing,
      }}
      // Android's runtime outlines the focused row itself, so the ring-colored border would
      // double it; the accent wash carries the focused state there instead.
      class={`flex-row items-center border-transparent hover:bg-muted active:bg-border ${platform.os === 'android' ? 'focus:bg-accent' : 'focus:border-ring focus:bg-accent'} ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
    >
      <Icon icon={props.icon} />
      <View class="flex-1" style={{ gap: space('xxs') }}>
        <Text
          style={{
            fontSize: textSize('meta'),
            fontWeight: textWeight('meta'),
            color: token('foreground'),
            numberOfLines: 1,
          }}
        >
          {props.label}
        </Text>
        <If when={props.meta}>
          <Text
            style={{
              fontSize: textSize('meta'),
              fontWeight: weight.regular(),
              color: token('muted-foreground'),
              numberOfLines: 1,
            }}
          >
            {props.meta}
          </Text>
        </If>
      </View>
    </CardRoot>
  );
}
