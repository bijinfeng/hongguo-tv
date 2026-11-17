import { Button, SettingsRow, SettingsSection } from '@hongguo/ui';
import type { Store } from '../../store';

/** Reset is the only local-data action we can confirm; no cache capacity is invented. */
export function SettingsLocalData(props: { store: Store }) {
  const settings = props.store.settings;
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
          disabled={settings.isDefault()}
          onPress={settings.reset}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
