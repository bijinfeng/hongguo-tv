import { View, cleanup, effect, lifecycle, signal, type ViewRef } from 'nsh';
import { Button, CinemaButton, Notice, UiText } from '@hongguo/ui';
import type { ReservationTarget } from '@hongguo/core-client';
import type { Store } from './store';
import { CalendarDays } from 'nsh-icon-lucide';

/** Minimal shared account capability used by calendar, details and the reservation page. */
export type ReservationStore = Pick<
  Store,
  'reservations' | 'account' | 'noteFocusIntent' | 'accountPage' | 'restoreFocus' | 'focusGuard'
>;

type ReturnFocus = { owns: () => boolean };

/** Exact source identity; an item identifier never becomes a playable series identifier. */
export function sameReservationTarget(a?: ReservationTarget, b?: ReservationTarget): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

/** Account membership and writes belong to the shared controller, not the entry's public metadata. */
export function ReservationAction(props: {
  store: ReservationStore;
  target?: ReservationTarget;
  active: boolean;
  testID: string;
  /** Draws the cinema pairing for the dark player band; the detail page keeps the page button. */
  cinema?: boolean;
  buttonRef?: (ref: ViewRef) => void;
}) {
  const reservations = props.store.reservations;
  let disposed = false;
  let actionRef: ViewRef | undefined;
  let frame = 0;
  const returnFocus = signal<ReturnFocus | undefined>(undefined);
  const setActionRef = (ref: ViewRef) => {
    actionRef = ref;
    props.buttonRef?.(ref);
  };
  const signedIn = () => props.store.account()?.logged_in === true;
  const observed = () =>
    !!props.target &&
    reservations
      .snapshot()
      ?.items.some((item) =>
        props.target!.kind === 'item'
          ? item.reservation_id === props.target!.id
          : item.series_id === props.target!.id,
      ) === true;
  const membership = () => (props.target ? reservations.membership(props.target) : undefined);
  const blocked = () =>
    !reservations.snapshot() ||
    reservations.loading() ||
    reservations.stale() ||
    reservations.busy();
  const pending = () =>
    sameReservationTarget(reservations.mutation()?.target, props.target) &&
    reservations.mutation()?.state === 'pending';
  const label = () => (!props.target ? '尚未开放预约' : observed() ? '已预约' : '预约');
  const focusReturnedAction = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const plan = returnFocus();
      if (!plan || disposed || !props.active || lifecycle() !== 'active' || !plan.owns()) {
        if (plan && (!props.active || !plan.owns())) returnFocus.set(undefined);
        return;
      }
      // Account state may still be reconciling after the route returns. Keep the
      // plan until the first usable action state instead of stealing focus early.
      if (signedIn() && blocked()) return;
      const ref = actionRef;
      if (!ref) return;
      returnFocus.set(undefined);
      ref.reveal({ horizontal: 'nearest', vertical: 'nearest', animated: false });
      ref.focus();
    });
  };
  effect(() => {
    const plan = returnFocus();
    // Read the guards in the effect so a delayed account refresh wakes this
    // plan when loading/stale/mutation state settles.
    const ready = !signedIn() || !blocked();
    lifecycle();
    if (plan && ready) focusReturnedAction();
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    returnFocus.set(undefined);
  });
  const press = () => {
    const target = props.target;
    if (!props.active || !target) return;
    props.store.noteFocusIntent();
    if (!signedIn()) {
      let returnHandled = false;
      props.store.accountPage(() => {
        if (returnHandled) return;
        returnHandled = true;
        returnFocus.set({ owns: props.store.focusGuard() });
      });
      props.store.restoreFocus();
      return;
    }
    if (blocked()) return;
    // Undefined membership is not a confirmed absence; explicitly request add.
    void reservations.set(target, membership() !== true).catch(() => {});
  };
  return (
    <If
      when={props.cinema}
      else={
        <Button
          testID={props.testID}
          label={label()}
          icon={CalendarDays}
          selected={observed()}
          pending={pending()}
          buttonRef={setActionRef}
          disabled={!props.active || !props.target || (signedIn() && blocked())}
          onPress={press}
        />
      }
    >
      <CinemaButton
        testID={props.testID}
        label={label()}
        icon={CalendarDays}
        selected={observed()}
        pending={pending()}
        buttonRef={setActionRef}
        disabled={!props.active || !props.target || (signedIn() && blocked())}
        onPress={press}
      />
    </If>
  );
}

/** Refresh only reads. A retry keeps the controller's original identity and absolute goal. */
export function ReservationNotice(props: {
  store: ReservationStore;
  active: boolean;
  testID: string;
}) {
  const reservations = props.store.reservations;
  const mutation = () => reservations.mutation();
  const unresolved = () => ['unknown', 'unconfirmed'].includes(mutation()?.state ?? '');
  const message = () =>
    unresolved()
      ? mutation()?.state === 'unconfirmed'
        ? '请求已提交，预约结果待确认。'
        : '预约结果待确认，请先刷新状态。'
      : reservations.error() ||
        (!reservations.loading() && reservations.stale() ? '当前预约列表尚未刷新。' : '');
  return (
    <If when={props.store.account()?.logged_in}>
      <If when={reservations.loading() && !reservations.snapshot()}>
        <UiText tone="muted" testID={`${props.testID}-loading`}>
          正在读取预约状态…
        </UiText>
      </If>
      <If when={message()}>
        <View class="gap-3" testID={props.testID}>
          <Notice
            error
            message={message()}
            retryLabel="刷新状态"
            retry={() => {
              if (props.active && mutation()?.state !== 'pending') {
                props.store.noteFocusIntent();
                void reservations.refresh().catch(() => {});
              }
            }}
          />
          <If when={unresolved()}>
            <View class="flex-row">
              <Button
                testID={`${props.testID}-retry`}
                label={mutation()?.enabled ? '重试预约' : '重试取消预约'}
                disabled={!props.active || reservations.loading()}
                onPress={() => {
                  if (props.active) {
                    props.store.noteFocusIntent();
                    void reservations.retry().catch(() => {});
                  }
                }}
              />
            </View>
          </If>
        </View>
      </If>
    </If>
  );
}
