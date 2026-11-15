import { batch, cleanup, effect, signal, untracked } from 'nsh';
import {
  CoreError,
  markNotificationRead,
  readNotifications,
  type Account,
  type NotificationMarkReadRequest,
  type NotificationSnapshot,
  type captureRequest,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

type Mutation = {
  id?: string;
  all: boolean;
  state: 'pending' | 'unknown';
};
const key = (account: Account | undefined) =>
  account?.logged_in && account.owner_id && account.owner_epoch
    ? JSON.stringify([account.owner_id, account.owner_epoch])
    : '';
const unresolved = () => '已读结果未知，请刷新状态';

/** Foreground-only local notification state. A lost POST is never replayed automatically. */
export function createNotificationsState(
  request: ReturnType<typeof captureRequest>,
  account: () => Account | undefined,
  active: () => boolean,
) {
  const snapshot = signal<NotificationSnapshot | undefined>(undefined);
  const loading = signal(false);
  const stale = signal(false);
  const error = signal('');
  const mutation = signal<Mutation | undefined>(undefined);
  let scopeKey = '';
  let scope: { owner_id: string; owner_epoch: string } | undefined;
  let visible = false;
  let disposed = false;
  let revision = 0;
  let operation = 0;
  let readAbort: AbortController | undefined;
  let writeAbort: AbortController | undefined;
  const available = () => !disposed && !!scope && active() && key(account()) === scopeKey;
  const cancelRead = () => {
    revision++;
    readAbort?.abort();
    readAbort = undefined;
    loading.set(false);
  };
  const invalidateWrite = () => {
    operation++;
    writeAbort?.abort();
    writeAbort = undefined;
  };
  const refresh = async () => {
    if (!available() || mutation()?.state === 'pending') return;
    cancelRead();
    const owned = revision;
    const expected = { ...scope! };
    const controller = new AbortController();
    readAbort = controller;
    const owns = () => available() && owned === revision && !controller.signal.aborted;
    batch(() => {
      loading.set(true);
      stale.set(!!snapshot());
      error.set('');
    });
    try {
      const next = await readNotifications(request, expected, controller.signal);
      if (!owns()) return;
      batch(() => {
        snapshot.set(next);
        stale.set(next.stale);
        error.set(next.error ?? '');
        mutation.set(undefined);
      });
    } catch (cause) {
      if (owns()) {
        stale.set(true);
        error.set(errorMessage(cause, '更新提醒读取未完成'));
      }
    } finally {
      if (owns()) {
        loading.set(false);
        readAbort = undefined;
      }
    }
  };
  const dispatch = async (intent: NotificationMarkReadRequest) => {
    cancelRead();
    const owned = ++operation;
    const controller = new AbortController();
    writeAbort = controller;
    const all = intent.all === true;
    mutation.set({ id: intent.id, all, state: 'pending' });
    error.set('');
    const owns = () => available() && owned === operation && !controller.signal.aborted;
    try {
      const next = await markNotificationRead(request, intent, controller.signal);
      if (!owns()) return;
      batch(() => {
        snapshot.set(next);
        stale.set(next.stale);
        error.set(next.error ?? '');
        mutation.set(undefined);
      });
    } catch (cause) {
      if (!owns()) return;
      if (
        cause instanceof CoreError &&
        [
          'ACCOUNT_NOTIFICATION_LOGIN_REQUIRED',
          'ACCOUNT_OWNER_CHANGED',
          'ACCOUNT_NOTIFICATION_INVALID_READ',
          'ACCOUNT_REQUEST_INVALID',
        ].includes(cause.code)
      ) {
        mutation.set(undefined);
        stale.set(true);
        error.set(errorMessage(cause, '更新提醒操作未完成'));
      } else {
        mutation.set({ id: intent.id, all, state: 'unknown' });
        stale.set(true);
        error.set(unresolved());
      }
    } finally {
      if (owns()) writeAbort = undefined;
    }
  };
  effect(() => {
    const next = account();
    const nextKey = key(next);
    const nextVisible = active();
    untracked(() => {
      if (disposed) return;
      const changed = nextKey !== scopeKey;
      if (changed) {
        cancelRead();
        invalidateWrite();
        scopeKey = nextKey;
        scope = nextKey ? { owner_id: next!.owner_id, owner_epoch: next!.owner_epoch } : undefined;
        batch(() => {
          snapshot.set(undefined);
          mutation.set(undefined);
          stale.set(false);
          error.set('');
        });
      }
      if (!nextVisible && visible) {
        cancelRead();
        invalidateWrite();
        if (snapshot()) stale.set(true);
        const pending = mutation();
        if (pending?.state === 'pending') {
          mutation.set({ ...pending, state: 'unknown' });
          stale.set(true);
          error.set(unresolved());
        }
      }
      const entering = nextVisible && (!visible || changed);
      visible = nextVisible;
      if (entering && scope) void refresh();
    });
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelRead();
    invalidateWrite();
  };
  cleanup(dispose);
  return {
    snapshot,
    loading,
    stale,
    error,
    mutation,
    busy: () => loading() || !!mutation(),
    unreadCount: () => snapshot()?.unread_count,
    refresh,
    markRead(id: string) {
      if (!available() || loading() || mutation() || !scope || !id) return Promise.resolve();
      return dispatch({ ...scope, id });
    },
    markAllRead() {
      if (!available() || loading() || mutation() || !scope) return Promise.resolve();
      return dispatch({ ...scope, all: true });
    },
    async retry() {
      const pending = mutation();
      if (!available() || !pending || pending.state === 'pending' || loading()) return;
      await refresh();
    },
    dispose,
  };
}
