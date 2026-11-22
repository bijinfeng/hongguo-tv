import { Button, SettingsRow, SettingsSection, Switch } from '@hongguo/ui';
import type { ViewRef } from 'nsh';
import type { Store } from '../../store';
import type { Updates } from '../../updates';
import { isUpdateBusy, updateStatusCopy } from '../../updates-flow';
import { UpdateInlineFacts, UpdatePrimaryButton } from '../updates/UpdateInline';

/**
 * Update preference and the existing update flow; only hosts with an update service get it.
 * Desktop completes every operation inline in this section; TV opens the shared dialog.
 */
export function SettingsUpdates(props: { store: Store; updates: Updates; tv: boolean }) {
  const busy = () => isUpdateBusy(props.updates.phase());
  const versionText = () => {
    const version = props.updates.version();
    // While an operation runs, its title lives on the action button; the row keeps only the version.
    if (!props.tv && busy()) return version;
    return [version, updateStatusCopy(props.updates)].filter(Boolean).join(' · ');
  };
  return (
    <SettingsSection title="应用更新">
      <SettingsRow
        label="自动检查更新"
        description="打开应用后检查是否有新的安装包。"
        testID="settings-auto-updates-row"
      >
        <Switch
          label="自动检查更新"
          labelHidden
          checked={props.store.settings.autoCheckUpdates()}
          disabled={!props.store.settings.loaded()}
          onChange={(event) => props.store.settings.setAutoCheckUpdates(event.checked)}
          testID="settings-auto-updates"
        />
      </SettingsRow>
      <SettingsRow label="应用版本" value={versionText()} testID="settings-version-row">
        <If
          when={props.tv}
          else={<UpdatePrimaryButton updates={props.updates} focusGuard={props.store.focusGuard} />}
        >
          {() => <TvUpdateEntry store={props.store} />}
        </If>
      </SettingsRow>
      <If when={!props.tv}>
        <UpdateInlineFacts updates={props.updates} />
      </If>
    </SettingsSection>
  );
}

/** The TV entry keeps the compact row; the dialog owns the whole flow. */
function TvUpdateEntry(props: { store: Store }) {
  let entry: ViewRef | undefined;
  return (
    <Button
      testID="settings-check-updates"
      buttonRef={(ref) => {
        entry = ref;
      }}
      label="检查更新"
      variant="quiet"
      compact
      onPress={() => props.store.openUpdateDialog(() => entry?.focus())}
    />
  );
}
