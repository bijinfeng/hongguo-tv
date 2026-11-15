import { List, View, cleanup, effect, fontScale, lifecycle, type ListRef, type ViewRef } from 'nsh';
import { Badge, Button, ContentArrival, Cover, Notice, Surface, UiText, tvUnit } from '@hongguo/ui';
import type { NotificationItem } from '@hongguo/core-client';
import type { Store } from '../store';

export function notificationLabel(item: NotificationItem): string {
  return item.kind === 'reservation_online' ? '预约已上线' : '追更有更新';
}

export function Notifications(props: { store: Store }) {
  const notifications = props.store.notifications;
  const signedIn = () => props.store.account()?.logged_in === true;
  const active = () => props.store.activePage('notifications') && lifecycle() === 'active';
  const items = () => notifications.snapshot()?.items ?? [];
  let list: ListRef | undefined;
  let refreshRef: ViewRef | undefined;
  let frame = 0;
  const actions = new Map<string, { detail?: ViewRef; read?: ViewRef }>();
  let disposed = false;
  effect(() => {
    if (!active() || props.store.target !== 'tv') return;
    props.store.primaryReady('notifications');
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    list = undefined;
    actions.clear();
  });
  const restoreAction = (id: string) => {
    if (disposed || !active()) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const index = items().findIndex((item) => item.id === id);
      if (index >= 0) list?.scrollToIndex({ index, animated: false });
      const action = actions.get(id);
      const row = items().find((item) => item.id === id);
      const ref = (row?.read ? action?.detail : action?.read) ?? action?.detail ?? refreshRef;
      if (!ref) return;
      ref.reveal({ vertical: 'nearest', horizontal: 'nearest', animated: false });
      ref.focus();
    });
  };
  const refresh = () => {
    if (!disposed && active()) {
      props.store.noteFocusIntent();
      void notifications.refresh().catch(() => {});
    }
  };
  const open = (item: NotificationItem) => {
    if (!active() || !item.drama) return;
    props.store.noteFocusIntent();
    props.store.open(item.drama, () => restoreAction(item.id));
  };
  const markRead = async (item: NotificationItem) => {
    if (!active() || item.read) return;
    props.store.noteFocusIntent();
    await notifications.markRead(item.id);
    restoreAction(item.id);
  };
  return (
    <View
      testID="notifications-page"
      class={`flex-1 gap-4 ${props.store.target === 'desktop' ? 'px-10 pt-7 pb-8' : ''}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32) } : undefined}
    >
      <View class="flex-row flex-wrap items-center justify-between gap-4">
        <View class="flex-row items-center gap-3">
          <UiText role="page">更新提醒</UiText>
          <If
            when={
              signedIn() &&
              notifications.unreadCount() !== undefined &&
              notifications.unreadCount()! > 0
            }
          >
            <Badge
              label={`${notifications.unreadCount()} 条未读`}
              tone="selected"
              testID="notifications-badge"
            />
          </If>
        </View>
        <Button
          label="刷新"
          icon="refresh-cw"
          testID="notifications-refresh"
          pending={notifications.loading()}
          disabled={!signedIn() || !active() || notifications.mutation()?.state === 'pending'}
          buttonRef={(ref) => {
            refreshRef = ref;
            if (props.store.target === 'tv' && signedIn())
              props.store.primaryRef('notifications', ref);
          }}
          onPress={refresh}
        />
      </View>
      <If when={!signedIn()}>
        <Notice message="登录后查看更新提醒。" />
        <View class="self-start">
          <Button
            label="登录账号"
            testID="notifications-login"
            primary
            buttonRef={(ref) => {
              if (props.store.target === 'tv' && !signedIn())
                props.store.primaryRef('notifications', ref);
            }}
            onPress={() => {
              props.store.noteFocusIntent();
              props.store.accountPage();
              props.store.restoreFocus();
            }}
          />
        </View>
      </If>
      <If when={signedIn() && notifications.error()}>
        <Notice
          testID="notifications-error"
          error
          message={notifications.error()}
          retry={() => {
            if (notifications.mutation()?.state === 'unknown') void notifications.retry();
            else refresh();
          }}
        />
      </If>
      <If when={signedIn() && notifications.loading() && !notifications.snapshot()}>
        <Notice message="正在读取更新提醒…" />
      </If>
      <If when={signedIn() && notifications.stale() && !notifications.error()}>
        <Notice message="显示上次读取的更新提醒。" retry={refresh} />
      </If>
      <If
        when={signedIn() && notifications.snapshot() && !items().length && !notifications.loading()}
      >
        <Notice message="暂无更新提醒。" />
      </If>
      <If when={signedIn() && notifications.snapshot()}>
        <ContentArrival class="flex-1">
          <List
            ref={(ref) => {
              list = ref;
            }}
            testID="notifications-list"
            each={items()}
            keyExtractor={(item: NotificationItem) => item.id}
            estimatedItemSize={(props.store.target === 'tv' ? tvUnit(168) : 132) * fontScale()}
            class="flex-1"
            contentStyle={{ padding: 8, gap: props.store.target === 'tv' ? tvUnit(12) : 12 }}
          >
            {(item) => {
              const row = item() as NotificationItem;
              return (
                <NotificationRow
                  item={row}
                  store={props.store}
                  pending={notifications.mutation()?.id === row.id}
                  open={() => open(row)}
                  markRead={() => void markRead(row)}
                  register={(kind, ref) => {
                    const action = actions.get(row.id) ?? {};
                    action[kind] = ref;
                    actions.set(row.id, action);
                  }}
                />
              );
            }}
          </List>
        </ContentArrival>
      </If>
      <If when={signedIn() && notifications.snapshot() && items().some((item) => !item.read)}>
        <View class="self-start">
          <Button
            label="全部标为已读"
            variant="quiet"
            testID="notifications-mark-all"
            pending={notifications.mutation()?.all === true}
            disabled={notifications.busy() || !active()}
            onPress={() => void notifications.markAllRead()}
          />
        </View>
      </If>
    </View>
  );
}

function NotificationRow(props: {
  item: NotificationItem;
  store: Store;
  pending: boolean;
  open: () => void;
  markRead: () => void;
  register: (kind: 'detail' | 'read', ref: ViewRef) => void;
}) {
  const item = props.item;
  const canOpen = !!item.drama;
  return (
    <Surface
      variant="content"
      testID={`notification-${item.id}`}
      class="flex-row min-w-0 items-center gap-3 p-3"
    >
      <Cover
        src={item.drama?.cover}
        title={item.title}
        variant="poster"
        class="w-16 shrink-0"
        height={props.store.target === 'tv' ? tvUnit(96) : 80}
      />
      <View class="flex-1 min-w-0 gap-1">
        <View class="flex-row items-center gap-2">
          <UiText role="title" lines={2}>
            {item.title}
          </UiText>
          <If when={!item.read}>
            <Badge label="未读" tone="selected" />
          </If>
        </View>
        <UiText role="meta" tone="muted">{`${notificationLabel(item)} · ${item.message}`}</UiText>
        <If when={item.episode !== undefined}>
          <UiText role="meta" tone="muted">{`第 ${item.episode} 集`}</UiText>
        </If>
      </View>
      <View class="shrink-0 gap-2">
        <If when={canOpen}>
          <Button
            label="查看详情"
            compact={props.store.target === 'desktop'}
            buttonRef={(ref) => props.register('detail', ref)}
            onPress={props.open}
          />
        </If>
        <If when={!item.read}>
          <Button
            label="标为已读"
            variant="quiet"
            buttonRef={(ref) => props.register('read', ref)}
            pending={props.pending}
            disabled={props.pending}
            onPress={props.markRead}
          />
        </If>
      </View>
    </Surface>
  );
}
