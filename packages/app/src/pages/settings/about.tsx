import { appInfo } from 'nsh';
import { SettingsRow, SettingsSection } from '@hongguo/ui';
import type { Updates } from '../../updates';

/** Build metadata is real; the product has no payment or promotion channels to point at. */
export function SettingsAbout(props: { updates?: Updates }) {
  return (
    <SettingsSection title="关于" testID="settings-about">
      <SettingsRow
        label={appInfo().name || '红果短剧'}
        value={props.updates?.version() || appInfo().version || '版本信息不可用'}
      />
      <If when={appInfo().build !== null}>
        <SettingsRow label="构建版本" value={String(appInfo().build)} />
      </If>
      <SettingsRow label="开源许可" value="MIT" />
    </SettingsSection>
  );
}
