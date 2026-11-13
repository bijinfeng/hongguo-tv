import { View, cleanup, effect, platform, type JSX, type ViewRef } from 'nsh';

/** NSH 0.5 macOS activates a pressed trigger before dispatching the open Select's Enter. */
export function SelectFocus(props: { open?: boolean; gap: number; children?: JSX.Element }) {
  // Whether this is a Select trigger is fixed for the component's lifetime.
  if (props.open === undefined) return props.children;
  let content: ViewRef | undefined;
  effect(() => {
    if (platform.os !== 'macos' || !props.open) return;
    const frame = requestAnimationFrame(() => {
      if (props.open) content?.focus();
    });
    cleanup(() => cancelAnimationFrame(frame));
  });
  return (
    <View
      ref={(ref) => {
        content = ref;
      }}
      focusable={platform.os === 'macos' && props.open}
      class="flex-row items-center"
      style={{ gap: props.gap }}
    >
      {props.children}
    </View>
  );
}
