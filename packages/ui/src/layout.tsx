import { View, reduceMotion, type JSX } from 'nsh';
import { Toolbar } from 'nsh/base';
import { entrance } from './motion';

/** Explicit arrival only; static surfaces and recycled rows never opt in implicitly. */
export function ContentArrival(props: { children?: JSX.Element; class?: string }) {
  const motion = entrance();
  return (
    <View class={props.class} style={reduceMotion() ? undefined : motion.style}>
      {props.children}
    </View>
  );
}
/** Compatibility toolbar: native behavior owns focus; caller supplies actions. */
export function Controls(props: {
  label: string;
  children?: JSX.Element;
  vertical?: boolean;
  class?: string;
}) {
  return (
    <Toolbar
      accessibilityLabel={props.label}
      axis={props.vertical ? 'vertical' : 'horizontal'}
      class={`${props.vertical ? 'flex-col' : 'flex-row flex-wrap'} gap-3 ${props.class ?? ''}`}
    >
      {props.children}
    </Toolbar>
  );
}
