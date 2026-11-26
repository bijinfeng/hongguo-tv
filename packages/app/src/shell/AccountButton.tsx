import { token, type ViewRef } from 'nsh';
import { Avatar, Button, Icon } from '@hongguo/ui';
import type { Store } from '../store';

/**
 * The account's presence in a top bar: the profile picture once signed in, an outline while
 * signed out, never the name. The name lives in the account page and in the desktop rail, so
 * repeating it here would say the same thing twice — and a service-generated name ("用户" plus
 * a long id) would stretch a bar whose height and rhythm are fixed.
 *
 * Both hosts share this so desktop and TV never disagree about what an account looks like.
 */
export function AccountButton(props: {
  store: Store;
  size?: 'sm' | 'md' | 'lg';
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
}) {
  const account = () => props.store.account();
  const profile = () => account()?.profile;
  const signedIn = () => account()?.logged_in === true;
  const label = () => (signedIn() ? profile()?.name || '账号' : '登录');
  const artwork = () => (
    <If when={signedIn()} else={<Icon name="user" color={token('muted-foreground')} />}>
      <Avatar
        src={profile()?.avatar ?? undefined}
        name={profile()?.name || '账号'}
        size="sm"
        accessibilityLabel=""
      />
    </If>
  );
  return (
    <Button
      iconOnly
      variant="quiet"
      size={props.size}
      label={label()}
      testID={props.testID}
      buttonRef={props.buttonRef}
      onPress={props.store.accountPage}
      artwork={artwork()}
      // The picture is the whole control, so it takes no horizontal inset; the control still
      // keeps its own target height and focus ring. Without this the avatar's width plus the
      // icon-only padding pushed the TV header's last tabs off the bar.
      style={{ paddingHorizontal: 0 }}
    />
  );
}
