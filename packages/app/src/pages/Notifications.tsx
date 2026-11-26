import { List, View, cleanup, effect, fontScale, lifecycle, type ListRef, type ViewRef } from 'nsh';
import {
  Badge,
  Button,
  ContentArrival,
  Cover,
  Notice,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  space,
} from '@hongguo/ui';
import type { NotificationItem } from '@hongguo/core-client';
import type { Store } from '../store';
import { PageScroll } from '../shell/PageScroll';
import { RefreshCw } from 'nsh-icon-lucide';

export function notificationLabel(item: NotificationItem): string {
  return item.kind === 'reservation_online' ? '预约已上线' : '追更有更新';
}

/**
 * The row's title already names what happened, so the detail line carries only the backend's own
 * message. Repeating the kind ("追更有更新 · 有新的更新。") restated the title with no new fact.
 */
export function notificationDetail(item: NotificationItem): string {
  const message = (item.message ?? '').trim();
  return message || notificationLabel(item);
}

export function Notifications(props: { store: Store }) {
  const notifications = props.store.notifications;
  const signedIn = () => props.store.account()?.logged_in === true;
  const active = () => props.store.activePage('notifications') && lifecycle() === 'active';
  const scope = () => {
    const account = props.store.account();
    return account?.logged_in && account.owner_id && account.owner_epoch
      ? JSON.stringify([account.owner_id, account.owner_epoch])
      : '';
  };
  const items = () => notifications.snapshot()?.items ?? [];
  let list: ListRef | undefined;
  let refreshRef: ViewRef | undefined;
  let frame = 0;
  let generation = 0;
  let scopeKey = scope();
  let restorePlan:
    | { id: string; scope: string; generation: number; owns: () => boolean }
    | undefined;
  const actions = new Map<string, { detail?: ViewRef; read?: ViewRef }>();
  let disposed = false;
  const scheduleRestore = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      const plan = restorePlan;
      if (
        !plan ||
        disposed ||
        !active() ||
        plan.scope !== scope() ||
        plan.generation !== generation ||
        !plan.owns()
      ) {
        if (plan && (!plan.owns() || plan.scope !== scope() || plan.generation !== generation))
          restorePlan = undefined;
        return;
      }
      const index = items().findIndex((item) => item.id === plan.id);
      if (index < 0) {
        restorePlan = undefined;
        return;
      }
      list?.scrollToIndex({ index, animated: false });
      const action = actions.get(plan.id);
      const row = items().find((item) => item.id === plan.id);
      const ref = (row?.read ? action?.detail : action?.read) ?? action?.detail ?? refreshRef;
      if (!ref) return;
      if (
        restorePlan !== plan ||
        !plan.owns() ||
        plan.scope !== scope() ||
        plan.generation !== generation
      )
        return;
      restorePlan = undefined;
      ref.reveal({ vertical: 'nearest', horizontal: 'nearest', animated: false });
      ref.focus();
    });
  };
  effect(() => {
    const nextScope = scope();
    const isActive = active();
    if (nextScope !== scopeKey) {
      scopeKey = nextScope;
      generation++;
      restorePlan = undefined;
      cancelAnimationFrame(frame);
    }
    if (isActive && restorePlan) scheduleRestore();
  });
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
  const restoreAction = (id: string, plan: ReturnType<typeof focusPlan>) => {
    if (disposed || !plan.owns() || plan.scope !== scope() || plan.generation !== generation)
      return;
    restorePlan = { id, ...plan };
    if (active()) scheduleRestore();
  };
  function focusPlan() {
    return { scope: scope(), generation, owns: props.store.focusGuard() };
  }
  const refresh = () => {
    if (!disposed && active()) {
      props.store.noteFocusIntent();
      void notifications.refresh().catch(() => {});
    }
  };
  const open = (item: NotificationItem) => {
    if (!active() || !item.drama) return;
    props.store.noteFocusIntent();
    const plan = focusPlan();
    props.store.open(item.drama, () => restoreAction(item.id, plan));
  };
  const markRead = async (item: NotificationItem) => {
    if (!active() || item.read) return;
    props.store.noteFocusIntent();
    const plan = focusPlan();
    await notifications.markRead(item.id);
    restoreAction(item.id, plan);
  };
  return (
    <PageScroll
      target={props.store.target}
      testID="notifications-page"
      top={24}
      gap={props.store.target === 'tv' ? 8 : 16}
    >
      <View
        class="flex-row flex-wrap items-center justify-between"
        style={{ gap: props.store.target === 'tv' ? 8 : 16 }}
      >
        <View class="flex-row items-center" style={{ gap: props.store.target === 'tv' ? 6 : 12 }}>
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
          icon={RefreshCw}
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
        <SkeletonRegion
          label="正在读取更新提醒"
          testID="notifications-pending"
          class="flex-col"
          style={{ gap: space('sm') }}
        >
          <Each of={[0, 1, 2]}>
            {() => (
              <View
                accessibilityElementsHidden
                class="flex-row items-center"
                style={{ gap: space('sm'), paddingVertical: space('sm') }}
              >
                <SkeletonBlock
                  width={props.store.target === 'tv' ? 36 : 64}
                  height={props.store.target === 'tv' ? 48 : 80}
                  radius={6}
                />
                <View class="flex-1" style={{ gap: space('xs') }}>
                  <SkeletonBlock width="45%" height={16} radius={4} />
                  <SkeletonBlock width="30%" height={12} radius={4} />
                </View>
              </View>
            )}
          </Each>
        </SkeletonRegion>
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
        <If when={items().some((item) => !item.read)}>
          {/* The batch action sits above the list it applies to, not past its last row. */}
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
        <ContentArrival class="flex-1">
          <List
            ref={(ref) => {
              list = ref;
            }}
            testID="notifications-list"
            viewport={props.store.target === 'tv' ? 'own' : 'parent'}
            each={items()}
            keyExtractor={(item: NotificationItem) => item.id}
            estimatedItemSize={(props.store.target === 'tv' ? 84 : 132) * fontScale()}
            class={props.store.target === 'tv' ? 'flex-1' : 'w-full'}
            contentStyle={{ padding: space('xs'), gap: space('sm') }}
            onLayout={scheduleRestore}
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
                  register={(kind, ref, previous) => {
                    const action = actions.get(row.id) ?? {};
                    if (ref) action[kind] = ref;
                    else if (previous && action[kind] === previous) delete action[kind];
                    if (!action.detail && !action.read) actions.delete(row.id);
                    else actions.set(row.id, action);
                    if (restorePlan?.id === row.id) scheduleRestore();
                  }}
                />
              );
            }}
          </List>
        </ContentArrival>
      </If>
    </PageScroll>
  );
}

function NotificationRow(props: {
  item: NotificationItem;
  store: Store;
  pending: boolean;
  open: () => void;
  markRead: () => void;
  register: (kind: 'detail' | 'read', ref?: ViewRef, previous?: ViewRef) => void;
}) {
  const item = props.item;
  const canOpen = !!item.drama;
  const references = new Map<'detail' | 'read', ViewRef>();
  effect(() => {
    for (const [kind, ref] of references) props.register(kind, ref);
    cleanup(() => {
      for (const [kind, ref] of references) props.register(kind, undefined, ref);
    });
  });
  const register = (kind: 'detail' | 'read', ref: ViewRef) => {
    references.set(kind, ref);
    props.register(kind, ref);
  };
  return (
    <View
      testID={`notification-${item.id}`}
      class="flex-row min-w-0 items-center border-b border-border py-3"
    >
      <View
        class="shrink-0"
        style={{
          width: props.store.target === 'tv' ? 36 : 64,
          height: props.store.target === 'tv' ? 48 : 80,
          marginRight: props.store.target === 'tv' ? 8 : 12,
        }}
      >
        <Cover src={item.drama?.cover} title={item.title} variant="poster" class="w-full h-full" />
      </View>
      <View class="flex-1 min-w-0" style={{ gap: props.store.target === 'tv' ? 2 : 4 }}>
        <View class="flex-row items-center" style={{ gap: props.store.target === 'tv' ? 4 : 8 }}>
          <UiText role="content-title" lines={2}>
            {item.title}
          </UiText>
          <If when={!item.read}>
            <Badge label="未读" tone="selected" />
          </If>
        </View>
        <UiText role="meta" tone="muted">
          {notificationDetail(item)}
        </UiText>
        <If when={item.episode !== undefined}>
          <UiText role="meta" tone="muted">{`第 ${item.episode} 集`}</UiText>
        </If>
      </View>
      <View class="shrink-0" style={{ gap: props.store.target === 'tv' ? 6 : 8 }}>
        <If when={canOpen}>
          <Button
            label="查看详情"
            compact={props.store.target === 'desktop'}
            buttonRef={(ref) => register('detail', ref)}
            onPress={props.open}
          />
        </If>
        <If when={!item.read}>
          <Button
            label="标为已读"
            variant="quiet"
            buttonRef={(ref) => register('read', ref)}
            pending={props.pending}
            disabled={props.pending}
            onPress={props.markRead}
          />
        </If>
      </View>
    </View>
  );
}
