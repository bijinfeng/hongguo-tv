import { View, signal, type ImageAsset } from 'nsh';
import { BackHandler } from 'nsh/mobile';
import { ConfirmDialog, SafeFrame } from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { UpdateDialog } from '../pages/updates/UpdateDialog';
import { Pages } from './Pages';
import { TvHeader } from './TvHeader';
import { tvInsets } from './tv-layout';

/** One page tree for the session: playback only changes chrome and safe-area presentation. */
export function TvShell(props: { store: Store; logoMark: ImageAsset; updates?: Updates }) {
  const rootPage = () => props.store.nav.routes().at(-1)?.name === 'browse';
  const exiting = signal(false);
  const exitError = signal('');
  return (
    <View class="flex-1">
      <SafeFrame insets={tvInsets()} enabled={!props.store.playing()}>
        <If when={rootPage()}>
          <TvHeader store={props.store} logoMark={props.logoMark} />
        </If>
        <View class="flex-1 min-h-0">
          <Pages store={props.store} updates={props.updates} />
        </View>
      </SafeFrame>
      <ConfirmDialog
        open={props.store.exitConfirmation()}
        title="退出红果？"
        description="观看记录和设置会保留。"
        confirmLabel="退出应用"
        testID="tv-exit-confirm"
        pending={exiting()}
        error={exitError()}
        onOpenChange={({ open }) => {
          props.store.exitConfirmation.set(open);
          if (!open) exitError.set('');
        }}
        returnFocus={props.store.focusPrimary}
        onConfirm={() => {
          exiting.set(true);
          void props.store
            .prepareUpdate()
            .then(async () => {
              await props.store.settings.flush();
              if (props.store.settings.error()) throw new Error('设置未保存，请重试');
              BackHandler.exitApp();
            })
            .catch(() => exitError.set('退出前未能保存数据，请重试'))
            .finally(() => exiting.set(false));
        }}
      />
      <If when={props.updates}>
        {() => (
          <UpdateDialog
            updates={props.updates!}
            open={props.store.updateDialogOpen()}
            onClose={() => props.store.closeUpdateDialog()}
          />
        )}
      </If>
    </View>
  );
}
