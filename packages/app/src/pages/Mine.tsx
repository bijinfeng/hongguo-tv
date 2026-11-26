import { Bell, BellRing, CalendarDays, Heart, History } from 'nsh-icon-lucide';
import { Scroll, View, type ViewRef } from 'nsh';
import { Avatar, Button, CardControls, Notice } from '@hongguo/ui';
import type { Store } from '../store';
import { ContinueSection } from './home/ContinueSection';
import { errorMessage } from '../error-messages';

/** Personal destinations reuse their existing controllers; this page owns no library copy. */
export function Mine(props: { store: Store }) {
  const account = () => props.store.account();
  let history: ViewRef | undefined;
  let favorites: ViewRef | undefined;
  let following: ViewRef | undefined;
  let reservations: ViewRef | undefined;
  let notifications: ViewRef | undefined;
  return (
    <Scroll testID="mine-scroll" class="flex-1 min-h-0" contentStyle={{ paddingVertical: 8 }}>
      <View style={{ gap: 20 }}>
        <View class="items-start">
          <Button
            testID="mine-account"
            variant="quiet"
            align="start"
            labelLines={2}
            label={
              account()?.logged_in
                ? account()?.profile?.name || '账号与同步'
                : props.store.account.loading()
                  ? '账号加载中'
                  : '登录账号'
            }
            displayLabel={
              account()?.logged_in
                ? account()?.profile?.name || '账号与同步'
                : props.store.account.loading()
                  ? '账号加载中'
                  : '登录账号'
            }
            disabled={!account() && props.store.account.loading()}
            artwork={
              <View accessibilityElementsHidden>
                <Avatar
                  name={account()?.profile?.name || '账号'}
                  src={account()?.profile?.avatar ?? undefined}
                />
              </View>
            }
            onPress={() => props.store.accountPage()}
          />
        </View>
        <CardControls
          label="我的片库"
          onNavigate={props.store.noteFocusIntent}
          class="flex-wrap"
          gap={12}
        >
          <Button
            testID="mine-history"
            buttonRef={(ref) => (history = ref)}
            label="观看记录"
            icon={History}
            onPress={() => props.store.openLibrary('history', () => history?.focus())}
          />
          <Button
            testID="mine-favorites"
            buttonRef={(ref) => (favorites = ref)}
            label="收藏"
            icon={Heart}
            onPress={() => props.store.openLibrary('favorites', () => favorites?.focus())}
          />
          <Button
            testID="mine-following"
            buttonRef={(ref) => (following = ref)}
            label="追更"
            icon={Bell}
            onPress={() => props.store.navigate('following', () => following?.focus())}
          />
          <Button
            testID="mine-reservations"
            buttonRef={(ref) => (reservations = ref)}
            label="预约"
            icon={CalendarDays}
            onPress={() => props.store.navigate('reservations', () => reservations?.focus())}
          />
          <Button
            testID="mine-notifications"
            buttonRef={(ref) => (notifications = ref)}
            label="更新提醒"
            icon={BellRing}
            variant="quiet"
            onPress={() => props.store.navigate('notifications', () => notifications?.focus())}
          />
        </CardControls>
        <If when={props.store.account.error()}>
          <Notice
            error
            message={errorMessage(props.store.account.error(), '账号读取失败')}
            retry={props.store.account.refetch}
          />
        </If>
        <ContinueSection store={props.store} showAll={false} />
      </View>
    </Scroll>
  );
}
