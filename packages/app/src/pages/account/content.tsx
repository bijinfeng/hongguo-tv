import { View, type JSX } from 'nsh';
import { ActionRow, Button, CardControls } from '@hongguo/ui';
import { AccountCard } from './card';

/** The account's content destinations; navigation and focus stay with the page. */
export interface AccountContentActions {
  onFollowing: () => void;
  onReservations: () => void;
  onNotifications?: () => void;
  onUpdates?: () => void;
  /**
   * A guest sees the same four destinations, but the three account-backed ones need a sign-in.
   * Saying so here avoids sending the reader to a page that only then asks for one.
   */
  signedIn?: boolean;
}

/**
 * The draft's "我的内容" card: one ruled row per destination on desktop. TV has no second
 * column and a shorter fold, so the page passes these actions into its identity card instead.
 */
export function AccountContent(props: AccountContentActions) {
  return (
    <AccountCard title="我的内容" testID="account-content" class="h-full">
      <View class="flex-col">
        <ActionRow
          label="追更"
          divided
          testID="account-following"
          description={props.signedIn === false ? '需要登录' : undefined}
          onPress={props.onFollowing}
        />
        <ActionRow
          label="预约"
          divided
          testID="account-reservations"
          description={props.signedIn === false ? '需要登录' : undefined}
          onPress={props.onReservations}
        />
        <If when={props.onNotifications}>
          <ActionRow
            label="更新提醒"
            divided
            testID="account-notifications"
            description={props.signedIn === false ? '需要登录' : undefined}
            onPress={props.onNotifications!}
          />
        </If>
        <If when={props.onUpdates}>
          <ActionRow label="应用更新" divided testID="account-updates" onPress={props.onUpdates!} />
        </If>
      </View>
    </AccountCard>
  );
}

/** The same destinations as remote-sized actions, for the TV identity card's lower band. */
export function AccountContentActions(props: AccountContentActions): JSX.Element {
  return (
    <CardControls label="我的内容" class="w-full">
      <Button label="追更" testID="account-following" onPress={props.onFollowing} />
      <Button label="预约" testID="account-reservations" onPress={props.onReservations} />
      <If when={props.onNotifications}>
        <Button label="更新提醒" testID="account-notifications" onPress={props.onNotifications!} />
      </If>
      <If when={props.onUpdates}>
        <Button label="应用更新" testID="account-updates" onPress={props.onUpdates!} />
      </If>
    </CardControls>
  );
}
