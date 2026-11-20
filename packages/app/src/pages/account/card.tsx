import { View, type JSX } from 'nsh';
import { Surface, UiText, space } from '@hongguo/ui';

/**
 * One account card: the draft's bordered surface, an optional section title and ruled rows.
 * Presentation only; values, rows and effects stay with the page or its controllers.
 */
export function AccountCard(props: {
  title?: string;
  /** Caller-owned layout classes; the card contributes surface, padding and radius. */
  class?: string;
  testID?: string;
  children?: JSX.Element;
}) {
  return (
    <Surface testID={props.testID} class={`border border-border ${props.class ?? ''}`}>
      <If when={props.title}>
        <UiText role="title">{props.title}</UiText>
      </If>
      <View style={{ gap: space('none') }}>{props.children}</View>
    </Surface>
  );
}
