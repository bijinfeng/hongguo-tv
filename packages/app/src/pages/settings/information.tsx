import { appInfo } from 'nsh';
import { SettingsRow, SettingsSection, UiText } from '@hongguo/ui';
import type { Updates } from '../../updates';

/** Build metadata is real; unconfigured destinations never become pretend links or payment codes. */
export function SettingsInformation(props: { page: string; updates?: Updates }) {
  return (
    <>
      <If when={props.page === 'about'}>
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
      </If>
      <If when={props.page === 'support'}>
        <SettingsSection title="支持与打赏" testID="settings-support">
          <UiText tone="muted">暂未开放支持与打赏渠道</UiText>
        </SettingsSection>
      </If>
      <If when={props.page === 'recommendations'}>
        <SettingsSection title="应用推荐" testID="settings-recommendations">
          <UiText tone="muted">暂时没有应用推荐</UiText>
        </SettingsSection>
      </If>
    </>
  );
}
