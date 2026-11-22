import { announce, effect, View, type ViewRef } from 'nsh';
import { Button, Dialog, DownloadProgress, UiText, space } from '@hongguo/ui';
import type { Updates } from '../../updates';
import {
  isUpdateBusy,
  updateCandidateLine,
  updatePrimaryAction,
  updateTitles,
} from '../../updates-flow';

/**
 * The TV update flow in one dialog: status, progress, notes and the stable primary action.
 * Closing never cancels a running download; the update controller outlives the dialog.
 */
export function UpdateDialog(props: {
  updates: Updates;
  /** Controlled visibility; the owner commits close through `onClose`. */
  open: boolean;
  onClose: () => void;
}) {
  const state = props.updates;
  let primary: ViewRef | undefined;
  // While the primary is disabled the safe secondary action receives the initial focus.
  let secondary: ViewRef | undefined;
  effect(() => {
    if (props.open) announce(updateTitles[state.phase()]);
  });
  const busy = () => isUpdateBusy(state.phase());
  const action = () => updatePrimaryAction(state.phase(), true);
  const label = () => action()?.label ?? updateTitles[state.phase()];
  return (
    <Dialog
      testID="update-dialog"
      open={props.open}
      title="应用更新"
      size="lg"
      closeButton
      onOpenChange={(event) => {
        if (!event.open) props.onClose();
      }}
      initialFocus={() => {
        if (!busy()) primary?.focus();
        else secondary?.focus();
      }}
      footer={
        <View class="flex-row flex-wrap justify-end" style={{ gap: space('sm') }}>
          <If when={state.canCancel && state.phase() === 'downloading'}>
            <Button
              label="取消下载"
              variant="quiet"
              testID="update-cancel-download"
              buttonRef={(ref) => {
                secondary = ref;
              }}
              onPress={state.cancel}
            />
          </If>
          <If when={state.phase() === 'installError' && state.update()}>
            <Button
              label="重新下载"
              variant="quiet"
              testID="update-redownload"
              buttonRef={(ref) => {
                secondary = ref;
              }}
              onPress={() => void state.redownload()}
            />
          </If>
          <If when={state.phase() === 'available'}>
            <Button label="稍后" variant="quiet" testID="update-later" onPress={props.onClose} />
          </If>
          <Button
            testID="navigation-primary-update"
            buttonRef={(ref) => {
              primary = ref;
            }}
            label={label()}
            primary
            disabled={busy()}
            onPress={() => action()?.run(state)}
          />
        </View>
      }
    >
      <UiText role="meta" tone="muted">
        {state.version() ? `当前版本 ${state.version()}` : '正在读取当前版本'}
      </UiText>
      <View>
        <UiText testID="update-status" role="section">
          {updateTitles[state.phase()]}
        </UiText>
      </View>
      <If when={state.phase() === 'available'}>
        <UiText testID="update-candidate" role="body">
          {updateCandidateLine(state.update())}
        </UiText>
      </If>
      <If when={['downloading', 'cancelling'].includes(state.phase())}>
        <DownloadProgress received={state.received()} total={state.total()} />
      </If>
      <If when={state.error()}>
        <UiText role="body" tone="error">
          {state.error()}
        </UiText>
      </If>
      <If when={state.phase() === 'permission'}>
        <UiText role="body" tone="muted">
          在系统设置中允许红果安装应用，返回后继续安装
        </UiText>
      </If>
      <If when={state.phase() === 'staged'}>
        <UiText role="body" tone="muted">
          更新已校验；退出应用时安装，下次打开即为新版本
        </UiText>
      </If>
      <If when={state.phase() === 'interrupted'}>
        <UiText role="body" tone="muted">
          之前准备的更新未能安装，当前仍是原版本
        </UiText>
      </If>
      <If when={state.update()?.notes}>
        <View class="gap-4">
          <UiText role="title">本版更新</UiText>
          <UiText role="body" tone="muted">
            {state.update()?.notes}
          </UiText>
        </View>
      </If>
    </Dialog>
  );
}
