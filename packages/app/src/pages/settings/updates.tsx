import { Button, SettingsRow, SettingsSection, Switch } from '@hongguo/ui';
import type { ViewRef } from 'nsh';
import type { Store } from '../../store';
import type { Updates } from '../../updates';

/** Copy for the update phases already owned by the update service, not a second state machine. */
function updateStatus(updates: Updates): string {
  const phase = updates.phase();
  if (phase === 'initializing') return '正在打开更新服务';
  if (phase === 'checking') return '正在检查更新';
  if (phase === 'latest') return '已是最新版本';
  if (phase === 'available') {
    const version = updates.update()?.version;
    return version ? `有新版本 ${version}` : '有新版本可用';
  }
  if (phase === 'downloading') return '正在下载更新';
  if (phase === 'ready') return '更新已下载，可以安装';
  if (phase === 'saving' || phase === 'staging') return '正在准备安装';
  if (phase === 'staged') return '退出应用后完成更新';
  if (phase === 'installing') return '正在安装更新';
  if (phase === 'interrupted') return '上次更新未完成';
  if (phase === 'success') return '应用已更新';
  if (phase === 'checkError') return '无法检查更新';
  if (phase === 'downloadError') return '更新下载失败';
  if (phase === 'installError') return '更新安装失败';
  if (phase === 'permission') return '需要安装权限';
  if (phase === 'manual') return '请前往发布页面下载';
  return '尚未检查更新';
}

/** Update preference and the existing update flow; only hosts with an update service get it. */
export function SettingsUpdates(props: { store: Store; updates: Updates }) {
  let updatesRef: ViewRef | undefined;
  const versionText = () =>
    [props.updates.version(), updateStatus(props.updates)].filter(Boolean).join(' · ');
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
        <Button
          variant="quiet"
          compact
          label="检查更新"
          testID="settings-check-updates"
          buttonRef={(ref) => {
            updatesRef = ref;
          }}
          onPress={() => props.store.openUpdates(() => updatesRef?.focus())}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
