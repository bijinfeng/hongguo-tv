import { View, token, type JSX } from 'nsh';
import { TitleBar as NativeTitleBar } from 'nsh/base';
import { isAvailable, titleBar, windowState } from 'nsh/desktop';
import { space } from '@hongguo/ui';

/**
 * The window's own title bar height. `apps/desktop/nsh.json` sets the same value as the window's
 * `titleBar.height`, so the system's controls are centred in this row and the first frame already
 * has no system title bar; both numbers must change together.
 */
export const TITLE_BAR_HEIGHT = 48;

/** Inline breathing room between the system's window controls and our own content. Read at call
 * time: `space` resolves through the current theme, so it must not be captured at module load. */
const controlGap = () => space('sm');

/**
 * Reserved width the system's window controls take on one side.
 * macOS puts traffic lights left, Windows puts caption buttons right, and GTK follows the user's
 * `gtk-decoration-layout`, which can be either. Reading the reported area instead of a per-platform
 * constant keeps a Linux user's switched layout from overlapping our content, and returns 0 while
 * the system title bar is visible, off desktops, and in full screen where there are no controls.
 */
export function controlInset(side: 'left' | 'right'): number {
  if (!isAvailable) return 0;
  const area = titleBar();
  return (side === 'left' ? area.left : area.right) + controlGap();
}

export function hasWindow(): boolean {
  return isAvailable && windowState() !== null;
}

/**
 * The desktop window's title bar: one drag row across the window with the brand, page name, search
 * and account actions inside it. Content never draws the window's controls; it only steps aside
 * for them.
 *
 * `collapsed` is the cinema and quiet-watching state, where the bar keeps a transparent drag strip
 * so the window can still be moved while only the system's controls show.
 */
export function TitleBar(props: { children?: JSX.Element; collapsed?: boolean }) {
  // The native bar handles dragging, double-click and per-window control padding, which only a
  // real window has. A browser and a headless host report no window state, so they get a plain
  // row with the same content instead of a native bar that cannot lay out.
  if (!hasWindow()) {
    return (
      <View
        class="w-full flex-row items-center gap-3"
        style={{
          minHeight: TITLE_BAR_HEIGHT,
          height: TITLE_BAR_HEIGHT,
          backgroundColor: props.collapsed ? undefined : token('card'),
        }}
      >
        {props.children}
      </View>
    );
  }
  return (
    <NativeTitleBar
      class="w-full flex-row items-center gap-3"
      style={{
        height: TITLE_BAR_HEIGHT,
        paddingLeft: controlInset('left'),
        paddingRight: controlInset('right'),
        // The bar is part of the rail's chrome, not the page: same surface, no divider. A line
        // here would be the border-as-layering the design spec rules out, and it showed as a
        // hard rule across the window in the real host.
        backgroundColor: props.collapsed ? undefined : token('card'),
      }}
    >
      {props.collapsed ? undefined : props.children}
    </NativeTitleBar>
  );
}
