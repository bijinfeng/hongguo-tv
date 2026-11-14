import { View, cleanup, type JSX, type ViewRef, type ViewProps } from 'nsh';

/** Standalone action only: Toolbar items keep BaseButton's roving registration. */
export function FocusedRemovalRoot(props: {
  ref?: (ref: ViewRef) => void;
  style?: ViewProps['style'];
  class?: string;
  testID?: string;
  disabled?: boolean;
  selected?: boolean;
  accessibilityLabel?: string | null;
  accessibilityDescription?: string;
  expanded?: boolean;
  onPress?: () => void;
  onFocusedRemoval?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children?: JSX.Element;
}) {
  let focused = false;
  cleanup(() => {
    const retained = focused;
    focused = false;
    if (retained) props.onFocusedRemoval?.();
  });
  return (
    <View
      ref={(ref) => props.ref?.(ref)}
      style={props.style}
      class={props.class}
      testID={props.testID}
      role="button"
      accessibilityLabel={props.accessibilityLabel ?? undefined}
      accessibilityHint={props.accessibilityDescription}
      accessibilityState={{
        disabled: !!props.disabled,
        selected: !!props.selected,
        expanded: props.expanded,
      }}
      disabled={props.disabled}
      onPress={props.onPress}
      onFocus={() => {
        focused = true;
        props.onFocus?.();
      }}
      onBlur={() => {
        focused = false;
        props.onBlur?.();
      }}
    >
      {props.children}
    </View>
  );
}
