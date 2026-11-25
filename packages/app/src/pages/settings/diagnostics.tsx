import { SettingsRow, SettingsSection, Switch } from '@hongguo/ui';
import { diagnosticsAvailable } from '../../diagnostics';
import type { Store } from '../../store';

/**
 * Diagnostics reporting is off until the user turns it on, and only hosts that can receive a
 * report show the row: elsewhere the switch would promise something nothing implements.
 */
export function SettingsDiagnostics(props: { store: Store }) {
  const settings = props.store.settings;
  const available = () => diagnosticsAvailable();
  return (
    <If when={available()}>
      <SettingsSection title="诊断数据">
        <SettingsRow
          label="发送诊断数据"
          description="把失败类别、错误码和操作名发给开发者，帮助定位问题。不包含账号信息、观看内容或输入的文字。"
          testID="settings-diagnostics-row"
          error={settings.failedKey() === 'diagnosticsReporting' ? settings.error() : undefined}
        >
          <Switch
            label="发送诊断数据"
            labelHidden
            checked={settings.diagnosticsReporting()}
            disabled={!settings.loaded()}
            onChange={(event) => {
              void settings.setDiagnosticsReporting(event.checked);
            }}
            testID="settings-diagnostics"
          />
        </SettingsRow>
      </SettingsSection>
    </If>
  );
}
