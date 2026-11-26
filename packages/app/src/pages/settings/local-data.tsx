import { signal, type ViewRef } from 'nsh';
import { Button, ConfirmDialog, SettingsRow, SettingsSection } from '@hongguo/ui';
import type { Store } from '../../store';

/** Reset is the only local-data action we can confirm; no cache capacity is invented. */
export function SettingsLocalData(props: { store: Store }) {
  const settings = props.store.settings;
  const confirm = signal(false);
  const pending = signal(false);
  const error = signal('');
  let source: ViewRef | undefined;
  return (
    <SettingsSection title="本机数据">
      <SettingsRow
        label="恢复默认设置"
        description="清除本机保存的偏好，恢复到首次启动时的选项。"
        testID="settings-local-data-row"
      >
        <Button
          variant="quiet"
          compact
          label="恢复默认设置"
          testID="settings-reset"
          buttonRef={(ref) => {
            source = ref;
          }}
          disabled={settings.isDefault()}
          onPress={() => {
            error.set('');
            confirm.set(true);
          }}
        />
      </SettingsRow>
      <ConfirmDialog
        open={confirm()}
        testID="settings-reset-confirm"
        title="恢复默认设置？"
        description="恢复本机的外观和播放偏好，观看记录与账号数据会保留。"
        confirmLabel="恢复默认设置"
        pending={pending()}
        error={error()}
        onOpenChange={({ open }) => confirm.set(open)}
        returnFocus={() => source?.focus()}
        onConfirm={() => {
          pending.set(true);
          settings.reset();
          void settings.flush().then(() => {
            pending.set(false);
            error.set(settings.error());
            if (!settings.error()) confirm.set(false);
          });
        }}
      />
    </SettingsSection>
  );
}
