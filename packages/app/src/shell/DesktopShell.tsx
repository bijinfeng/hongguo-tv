import { View, type ImageAsset } from 'nsh';
import { currentWindow, isAvailable } from 'nsh/desktop';
import { Product } from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { Pages } from './Pages';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/** Desktop and web outer frame: fixed rail beside the scrolled content column. */
export function DesktopShell(props: { store: Store; logoMark: ImageAsset; updates?: Updates }) {
  const window = isAvailable ? currentWindow() : undefined;
  // Fullscreen hides chrome on its own; quiet watching asks the same of a windowed player.
  const cinema = () =>
    props.store.playing() &&
    (window?.state()?.placement.mode === 'fullScreen' || props.store.settings.quietWatching());
  return (
    <Product.Provider value="desktop">
      <View class="flex-1 flex-row">
        <If when={!cinema()}>
          <Sidebar store={props.store} logoMark={props.logoMark} />
        </If>
        <View class="flex-1 min-w-0">
          <If when={!cinema()}>
            <Topbar store={props.store} />
          </If>
          <Pages store={props.store} updates={props.updates} />
        </View>
      </View>
    </Product.Provider>
  );
}
