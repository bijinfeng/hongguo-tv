import { View, context, type Edges, type JSX } from 'nsh';

const Insets = context<() => Edges>(() => ({ top: 0, right: 0, bottom: 0, left: 0 }));
/** Portaled surfaces share the caller's inset policy, applying it in their own native window. */
export const safeFrameInsets = () => Insets()();

/** A single safe content owner; backgrounds and fullscreen media stay outside this frame. */
export interface SafeFrameProps {
  children?: JSX.Element;
  insets: Edges;
  enabled?: boolean;
}
export function SafeFrame(props: SafeFrameProps) {
  return (
    <Insets.Provider value={() => props.insets}>
      <View
        class="flex-1 min-h-0"
        style={{
          paddingTop: props.enabled === false ? 0 : props.insets.top,
          paddingRight: props.enabled === false ? 0 : props.insets.right,
          paddingBottom: props.enabled === false ? 0 : props.insets.bottom,
          paddingLeft: props.enabled === false ? 0 : props.insets.left,
        }}
      >
        {props.children}
      </View>
    </Insets.Provider>
  );
}
