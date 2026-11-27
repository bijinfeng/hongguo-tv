import { View, type ImageAsset } from 'nsh';
import { currentWindow, isAvailable } from 'nsh/desktop';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { Pages } from './Pages';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { Topbar } from './Topbar';

/**
 * Desktop and web outer frame: the window's title bar across the top, then the fixed rail beside
 * the scrolled content column. The rail and the content both start at the bar's edge, so the window
 * has one horizontal band instead of a bar stacked on a second one.
 */
export function DesktopShell(props: { store: Store; logoMark: ImageAsset; updates?: Updates }) {
  const window = isAvailable ? currentWindow() : undefined;
  /** The window is full screen: the system owns the whole display and there is no chrome to draw. */
  const fullScreen = () => window?.state()?.placement.mode === 'fullScreen';
  // Quiet watching asks a windowed player for the same bare picture that full screen gives.
  const quiet = () => props.store.playing() && !!props.store.settings.quietWatching();
  const cinema = () => props.store.playing() && (fullScreen() || quiet());
  return (
    <View class="flex-1 flex-col">
      {/* Full screen drops the bar outright; quiet watching keeps a transparent strip so the window
          can still be dragged and the system's controls still work. */}
      <If when={!fullScreen()}>
        <TitleBar collapsed={cinema()}>
          <Topbar store={props.store} logoMark={props.logoMark} />
        </TitleBar>
      </If>
      <View class="flex-1 flex-row min-h-0">
        <If when={!cinema()}>
          <Sidebar store={props.store} />
        </If>
        <View class="flex-1 min-w-0">
          <Pages store={props.store} updates={props.updates} />
        </View>
      </View>
    </View>
  );
}
