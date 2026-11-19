import { View, type JSX, type ViewRef } from 'nsh';
import { Avatar, Button, Surface, UiText, space } from '@hongguo/ui';

/**
 * Who the account page is currently acting as: avatar, account state and the one action that
 * changes it. The page owns the account snapshot; this card only renders it.
 */
export function AccountIdentity(props: {
  name?: string;
  signedIn: boolean;
  busy: boolean;
  tv?: boolean;
  /** TV folds the content destinations under the identity so one band fits its fold. */
  actions?: JSX.Element;
  onLogin: () => void;
  onLogout: () => void;
  loginRef?: (ref: ViewRef) => void;
  logoutRef?: (ref: ViewRef) => void;
  testID?: string;
}) {
  /** Guest reads as a state; a signed-in name is the identity itself, not a status. */
  const stateLabel = () => (props.signedIn ? '当前账号' : '账号状态');
  const displayName = () => (props.signedIn ? props.name || '已登录' : '还未登录');
  const action = () => (
    <If
      when={props.signedIn}
      else={
        <Button
          label="登录账号"
          primary
          disabled={props.busy}
          pending={props.busy}
          testID="account-login-open"
          buttonRef={(ref) => props.loginRef?.(ref)}
          onPress={props.onLogin}
        />
      }
    >
      <Button
        label="退出登录"
        disabled={props.busy}
        pending={props.busy}
        testID="account-logout"
        buttonRef={(ref) => props.logoutRef?.(ref)}
        onPress={props.onLogout}
      />
    </If>
  );
  const identity = () => (
    <View class="flex-row items-center min-w-0" style={{ gap: space('md') }}>
      <Avatar name={props.name || '未登录'} size="lg" accessibilityLabel="" />
      <View class="flex-1 min-w-0" style={{ gap: space('xxs') }}>
        <UiText role="meta" tone="muted">
          {stateLabel()}
        </UiText>
        <UiText role="section">{displayName()}</UiText>
      </View>
    </View>
  );
  return (
    <Surface testID={props.testID} class="h-full border border-border">
      <If
        when={!props.tv}
        else={
          <View style={{ gap: space('md') }}>
            <View class="flex-row items-center justify-between" style={{ gap: space('md') }}>
              {identity()}
              <View>{action()}</View>
            </View>
            {props.actions}
          </View>
        }
      >
        {/* The paired column can be taller; the identity stays at the top and the action at the
            bottom, so the card never collects all the extra height above the avatar. */}
        <View class="flex-1 justify-between" style={{ gap: space('lg'), minHeight: 0 }}>
          <View>{identity()}</View>
          <View class="self-start">{action()}</View>
        </View>
      </If>
    </Surface>
  );
}
