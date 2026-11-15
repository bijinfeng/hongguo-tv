import { batch, cleanup, effect, signal, untracked } from 'nsh';
import {
  CoreError,
  reservationMembership,
  type ReservationTarget,
  readReservations,
  setReservation,
  type Account,
  type ReservationMutationRequest,
  type ReservationQuery,
  type ReservationSnapshot,
  type captureRequest,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

type Mutation = {
  target: ReservationTarget;
  enabled: boolean;
  state: 'pending' | 'unknown' | 'unconfirmed';
};
const key = (account: Account | undefined) =>
  account?.logged_in && account.owner_id && account.owner_epoch
    ? JSON.stringify([account.owner_id, account.owner_epoch])
    : '';
const unresolved = (state: Mutation['state']) =>
  state === 'unconfirmed' ? '操作已受理，预约状态尚未确认' : '操作结果未知，请刷新状态';

/** Online account membership; a lost reply is read back, never automatically posted again. */
export function createReservationState(
  request: ReturnType<typeof captureRequest>,
  account: () => Account | undefined,
  active: () => boolean,
) {
  const snapshot = signal<ReservationSnapshot | undefined>(undefined);
  const loading = signal(false);
  const stale = signal(false);
  const error = signal('');
  const mutation = signal<Mutation | undefined>(undefined);
  let scopeKey = '';
  let scope: ReservationQuery | undefined;
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
      stale.set(!!snapshot() || !!mutation());
      error.set('');
    });
    try {
      const next = await readReservations(request, expected, controller.signal);
      if (!owns()) return;
      batch(() => {
        snapshot.set(next);
        stale.set(false);
        const intent = mutation();
        if (intent) {
          const observed = reservationMembership(next, intent.target);
          if (observed === intent.enabled) mutation.set(undefined);
          else error.set(unresolved(intent.state));
        }
      });
    } catch (cause) {
      if (owns()) {
        stale.set(true);
        error.set(errorMessage(cause, '预约读取未完成'));
      }
    } finally {
      if (owns()) {
        loading.set(false);
        readAbort = undefined;
      }
    }
  };
  const dispatch = async (intent: ReservationMutationRequest) => {
    cancelRead();
    const owned = ++operation;
    const controller = new AbortController();
    writeAbort = controller;
    const owns = () => available() && owned === operation && !controller.signal.aborted;
    mutation.set({ target: { ...intent.target }, enabled: intent.enabled, state: 'pending' });
    error.set('');
    try {
      const result = await setReservation(request, intent, controller.signal);
      if (!owns()) return;
      batch(() => {
        if (result.snapshot) snapshot.set(result.snapshot);
        stale.set(!result.confirmed);
        if (result.confirmed) mutation.set(undefined);
        else {
          mutation.set({
            target: { ...intent.target },
            enabled: intent.enabled,
            state: 'unconfirmed',
          });
          error.set(unresolved('unconfirmed'));
        }
      });
    } catch (cause) {
      if (!owns()) return;
      // These responses reject the command explicitly; a subsequent GET must not turn it into success.
      const definite =
        cause instanceof CoreError &&
        [
          'ACCOUNT_RESERVATION_REJECTED',
          'ACCOUNT_RESERVATION_LOGIN_REQUIRED',
          'ACCOUNT_OWNER_CHANGED',
          'ACCOUNT_IDENTITY_MISMATCH',
          'ACCOUNT_REQUEST_INVALID',
          'ACCOUNT_RESERVATION_BUSY',
        ].includes(cause.code);
      stale.set(true);
      if (definite) {
        mutation.set(undefined);
        error.set(errorMessage(cause, '预约操作未完成'));
      } else {
        mutation.set({ target: { ...intent.target }, enabled: intent.enabled, state: 'unknown' });
        error.set(unresolved('unknown'));
        await refresh();
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
        const intent = mutation();
        if (intent?.state === 'pending') {
          mutation.set({ ...intent, state: 'unknown' });
          stale.set(true);
          error.set(unresolved('unknown'));
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
    membership: (target: ReservationTarget): boolean | undefined =>
      snapshot() && !stale() ? reservationMembership(snapshot()!, target) : undefined,
    refresh,
    async set(target: ReservationTarget, enabled: boolean) {
      if (!available() || loading() || mutation() || stale() || !snapshot()) return;
      if (reservationMembership(snapshot()!, target) === enabled) return;
      await dispatch({ ...scope!, target: { ...target }, enabled });
    },
    async retry() {
      const intent = mutation();
      if (!available() || !intent || intent.state === 'pending' || loading()) return;
      const owned = operation;
      await refresh();
      // An explicit retry targets the saved absolute intent, even after opening a different calendar item or season.
      if (!available() || owned !== operation || mutation() !== intent || stale()) return;
      await dispatch({ ...scope!, target: { ...intent.target }, enabled: intent.enabled });
    },
    dispose,
  };
}
