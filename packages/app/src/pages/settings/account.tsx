import { Button, SettingsRow, SettingsSection } from '@hongguo/ui';
import type { ViewRef } from 'nsh';
import type { Store } from '../../store';
import { User } from 'nsh-icon-lucide';

/** Account entry only; account state itself stays owned by the store and account page. */
export function SettingsAccount(props: { store: Store }) {
  let accountRef: ViewRef | undefined;
  const name = () => props.store.account()?.profile?.name;
  /** An unsettled read is neither guest nor signed in, and must not claim the guest row. */
  const unready = () => !props.store.account() && props.store.account.loading();
  return (
    <SettingsSection title="账号">
      <SettingsRow
        label="我的账号"
        description={
          unready()
            ? '正在读取账号状态…'
            : name()
              ? `${name()} · 观看记录会同步到该账号。`
              : '未登录，观看记录只保存在本机。'
        }
        testID="settings-account-row"
      >
        <Button
          variant="quiet"
          compact
          icon={User}
          label="查看账号"
          buttonRef={(ref) => {
            accountRef = ref;
          }}
          onPress={() => props.store.accountPage(() => accountRef?.focus())}
          testID="settings-account"
        />
      </SettingsRow>
    </SettingsSection>
  );
}
