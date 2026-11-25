import { Scroll, View, cleanup, type JSX, type ScrollRef } from 'nsh';
import type { ProductTarget } from '@hongguo/ui';
import { contentInset } from './poster-grid';

/**
 * The scroll body of a content page.
 *
 * Desktop scrolls the page itself, so the heading, filters and paging action travel with the
 * content instead of squeezing a list into the window left below the chrome. The page's `Scroll`
 * is the only scroll owner; a `List` inside uses `viewport="parent"`.
 *
 * TV keeps its bounded frame: a remote moves focus between lanes rather than dragging a page, so
 * the chrome stays put and the lane scrolls on its own.
 *
 * `onScrollSettled` runs when a gesture stops moving the page, from the scroll view's own
 * `onScrollEnd`. Recording a reading position costs one layout read per gesture instead of one
 * per frame; a `List` in a parent viewport cannot hear the view around it, so the page reports it.
 */
export function PageScroll(props: {
  target: ProductTarget;
  testID?: string;
  top?: number;
  bottom?: number;
  gap?: number;
  onScrollSettled?: () => void;
  scrollRef?: (ref: ScrollRef) => void;
  children?: JSX.Element;
}) {
  if (props.target === 'tv')
    return (
      <View
        testID={props.testID}
        class="flex-1"
        style={{ paddingTop: props.top ?? 16, gap: props.gap ?? 12 }}
      >
        {props.children}
      </View>
    );

  let frame = 0;
  cleanup(() => cancelAnimationFrame(frame));

  return (
    <Scroll
      ref={(ref) => {
        props.scrollRef?.(ref);
      }}
      testID={props.testID}
      class="flex-1 min-h-0"
      // Read the resting position after the last frame is laid out, so the measurement sees the
      // page where the reader left it.
      onScrollEnd={() => {
        frame = requestAnimationFrame(() => props.onScrollSettled?.());
      }}
      contentStyle={{
        paddingTop: props.top ?? 24,
        paddingBottom: props.bottom ?? 40,
        paddingHorizontal: contentInset(),
        gap: props.gap ?? 12,
      }}
    >
      {props.children}
    </Scroll>
  );
}
