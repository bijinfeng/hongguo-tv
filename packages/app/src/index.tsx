import { cleanup, effect, View, keymap, type ImageAsset } from 'nsh';
import { BackHandler } from 'nsh/mobile';
import { type ProductTarget } from '@hongguo/ui';
import { createUpdates, type UpdateAdapter } from './updates';
import { canPromptUpdate } from './updates-flow';
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
  // TV only: an actionable update found at startup pops the dialog; never over playback.
  effect(() => {
    if (props.target !== 'tv' || !updates) return;
    if (store.updateDialogOpen() || !canPromptUpdate(updates.phase())) return;
    if (store.playing()) return;
    store.promptUpdateDialog();
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
        return false;
      }),
    );
  keymap.bind(
    { tab: store.noteFocusIntent, 'shift+tab': store.noteFocusIntent },
    { when: 'always', passThrough: true },
  );
  props.onReady?.();
  return (
    <>
      <View
        testID={`app-${props.target}`}
        onTouchStartCapture={store.noteFocusIntent}
        class={
          props.target === 'tv'
            ? 'flex-1 bg-background'
            : 'flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
        }
      >
        <If
          when={props.target === 'tv'}
          else={<DesktopShell store={store} logoMark={props.logoMark} updates={updates} />}
        >
          <TvShell store={store} logoMark={props.logoMark} updates={updates} />
        </If>
      </View>
    </>
  );
}

export { NativeApp } from './NativeApp';
export { TitleBar, controlInset, TITLE_BAR_HEIGHT } from './shell/TitleBar';

export type { UpdateAdapter, AppUpdate, InstallState } from './updates';
export {
  reportFailure,
  reportDiagnostic,
  diagnosticEvent,
  sanitizeDiagnosticText,
  diagnosticsAvailable,
  diagnosticsConsent,
} from './diagnostics';
export type { DiagnosticCategory, DiagnosticEvent } from './diagnostics';
