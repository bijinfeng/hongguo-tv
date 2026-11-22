import { cleanup, effect, View, type ViewRef } from 'nsh';
import { Button, DownloadProgress, UiText } from '@hongguo/ui';
import type { Updates } from '../../updates';
import {
  isUpdateBusy,
  updatePrimaryAction,
  updateSizeText,
  updateTitles,
} from '../../updates-flow';

/**
 * The settings row's stable primary action; the label and treatment follow the phase and the
 * button keeps its position while an operation runs, restoring focus afterwards on desktop.
 */
export function UpdatePrimaryButton(props: {
  updates: Updates;
  /** Ownership probe for restoring the button's focus after a finished operation. */
  focusGuard?: () => () => boolean;
}) {
  const state = props.updates;
  let primary: ViewRef | undefined;
  let wasBusy = isUpdateBusy(state.phase());
  let pendingFocus: (() => boolean) | undefined;
  let frame = 0;
  effect(() => {
    const busy = isUpdateBusy(state.phase());
    const finished = wasBusy && !busy;
    wasBusy = busy;
    if (!finished || !pendingFocus) return;
    const owns = pendingFocus;
    pendingFocus = undefined;
    frame = requestAnimationFrame(() => {
      if (owns()) primary?.focus();
    });
  });
  cleanup(() => cancelAnimationFrame(frame));
  const busy = () => isUpdateBusy(state.phase());
  const action = () => updatePrimaryAction(state.phase(), false);
  const label = () => action()?.label ?? updateTitles[state.phase()];
  return (
    <Button
      testID="navigation-primary-update"
      buttonRef={(ref) => {
        primary = ref;
      }}
      label={label()}
      variant={action()?.variant ?? 'default'}
      disabled={busy()}
      onPress={() => {
        if (!busy()) pendingFocus = props.focusGuard?.() ?? (() => true);
        action()?.run(state);
      }}
    />
  );
}

/**
 * The facts an update phase adds below the settings rows: progress, package size, errors and
 * the phase's own explanation. Secondary actions live here, not beside the primary one.
 */
export function UpdateInlineFacts(props: { updates: Updates }) {
  const state = props.updates;
  return (
    <View class="gap-4" testID="update-inline-facts">
      <If when={['downloading', 'cancelling'].includes(state.phase())}>
        <DownloadProgress received={state.received()} total={state.total()} />
      </If>
      <If when={['available', 'ready'].includes(state.phase()) && state.update()?.size}>
        <UiText role="meta" tone="muted">
          {`安装包 ${updateSizeText(state.update()!.size!)}`}
        </UiText>
      </If>
      <If when={state.error()}>
        <UiText role="body" tone="error">
          {state.error()}
        </UiText>
      </If>
      <If when={state.phase() === 'staged'}>
        <UiText role="meta" tone="muted">
          更新已校验；退出应用时安装，下次打开即为新版本。
        </UiText>
      </If>
      <If when={state.phase() === 'interrupted'}>
        <UiText role="meta" tone="muted">
          之前准备的更新未能安装，当前仍是原版本。
        </UiText>
      </If>
      <If when={state.canCancel && state.phase() === 'downloading'}>
        <View>
          <Button
            label="取消下载"
            variant="quiet"
            compact
            testID="update-cancel-download"
            onPress={state.cancel}
          />
        </View>
      </If>
      <If when={state.phase() === 'installError' && state.update()}>
        <View>
          <Button
            label="重新下载"
            variant="quiet"
            compact
            testID="update-redownload"
            onPress={() => void state.redownload()}
          />
        </View>
      </If>
      <If when={state.update()?.notes}>
        <View class="gap-2">
          <UiText role="title">本版更新</UiText>
          <UiText role="body" tone="muted">
            {state.update()?.notes}
          </UiText>
        </View>
      </If>
    </View>
  );
}
