import {
  Overlay,
  Scroll,
  View,
  Text,
  createMotion,
  reduceMotion,
  type JSX,
  type ViewRef,
} from 'nsh';
import { CardControls, CardRoot } from './card-controls';
import { Icon, type IconName } from './icon';
import { Product, tvUnit } from './foundation';
import { motionTokens } from './motion';

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
          maxHeight: Product() === 'tv' ? tvUnit(480) : 360,
        }}
        class="rounded-(--radius) border border-border bg-card p-2"
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
            class="gap-1"
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
  icon: IconName;
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
      style={
        Product() === 'tv'
          ? { minHeight: tvUnit(72), padding: tvUnit(12), gap: tvUnit(16) }
          : { minHeight: 48 }
      }
      class={`flex-row items-center gap-3 rounded-(--radius) border-2 border-transparent px-3 py-2 hover:bg-muted active:bg-accent focus:border-ring focus:bg-accent ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
    >
      <Icon name={props.icon} />
      <View class="flex-1 gap-1">
        <Text
          class="line-clamp-1 text-sm text-foreground"
          style={Product() === 'tv' ? { fontSize: tvUnit(24) } : undefined}
        >
          {props.label}
        </Text>
        <If when={props.meta}>
          <Text
            class="line-clamp-1 text-xs text-muted-foreground"
            style={Product() === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          >
            {props.meta}
          </Text>
        </If>
      </View>
    </CardRoot>
  );
}
