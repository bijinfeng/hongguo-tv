import { cleanup, effect, View, keymap, type ImageAsset } from 'nsh';
import { BackHandler } from 'nsh/mobile';
import { Product, type ProductTarget } from '@hongguo/ui';
import { createUpdates, type UpdateAdapter } from './updates';
import { createStore, type FocusSource } from './store';
import { DesktopShell } from './shell/DesktopShell';
import { TvShell } from './shell/TvShell';
import type { PlaybackCommandSource } from './playback';

export function App(props: {
  target: ProductTarget;
  updates?: UpdateAdapter;
  logoMark: ImageAsset;
  subscribePlayerCommands?: PlaybackCommandSource;
  subscribeFocus?: FocusSource;
  onShutdown?: (drained: Promise<void>) => void;
  onReady?: () => void;
}) {
  const store = createStore(props.target, props.subscribePlayerCommands, props.subscribeFocus);
  const updates = props.updates
    ? createUpdates(props.updates, store.prepareUpdate, {
        autoCheck: () => store.settings.loaded() && store.settings.autoCheckUpdates(),
      })
    : undefined;
  // A saved preference loads after the service probe; catch up once it decides checking is on.
  effect(() => {
    if (!updates || !store.settings.loaded() || !store.settings.autoCheckUpdates()) return;
    if (updates.phase() === 'idle') void updates.check();
  });
  cleanup(() => {
    const drained = store.shutdown();
    props.onShutdown?.(drained);
  });
  // The Web runtime does not expose native back listeners.
  if (typeof BackHandler?.on === 'function')
    cleanup(
      BackHandler.on('press', () => {
        if (store.handleCalendarBack()) return true;
        if (!store.activePage('feed')) return false;
        store.back();
        return true;
      }),
    );
  keymap.bind(
    { tab: store.noteFocusIntent, 'shift+tab': store.noteFocusIntent },
    { when: 'always', passThrough: true },
  );
  props.onReady?.();
  return (
    <Product.Provider value={props.target}>
      <View
        testID={`app-${props.target}`}
        onTouchStartCapture={store.noteFocusIntent}
        class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <If
          when={props.target === 'tv'}
          else={<DesktopShell store={store} logoMark={props.logoMark} updates={updates} />}
        >
          <TvShell store={store} logoMark={props.logoMark} updates={updates} />
        </If>
      </View>
    </Product.Provider>
  );
}

export { NativeApp } from './NativeApp';

export type { UpdateAdapter, AppUpdate, InstallState } from './updates';
