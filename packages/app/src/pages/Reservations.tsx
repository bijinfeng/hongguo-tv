import {
  List,
  View,
  cleanup,
  effect,
  fontScale,
  lifecycle,
  signal,
  type ListRef,
  type ViewRef,
} from 'nsh';
import { Button, CardControls, ContentArrival, Cover, Notice, UiText, tvUnit } from '@hongguo/ui';
import type { ReservationItem } from '@hongguo/core-client';
import type { Store } from '../store';
import { ReservationNotice, sameReservationTarget } from '../ReservationAction';
import { desktopContentFrame } from '../shell/ContentColumn';

type Mode = 'upcoming' | 'online';
type Action = 'open' | 'cancel';

/** Missing reservation identity never falls back to a series write. */
export function reservationItemId(item: ReservationItem): string {
  return item.reservation_id ? `item-${item.reservation_id}` : `series-${item.series_id}`;
}

/** Public labels win; timestamps are exact upstream Unix seconds in China time. */
export function reservationPublishLabel(item: ReservationItem): string {
  if (item.publish_text) return item.publish_text;
  if (!item.publish_time) return '';
  const date = new Date((item.publish_time + 8 * 3600) * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} 上线`;
}

export function Reservations(props: { store: Store }) {
  const reservations = props.store.reservations;
  const mode = signal<Mode>('upcoming');
  const signedIn = () => props.store.account()?.logged_in === true;
  const scope = () =>
    JSON.stringify([props.store.account()?.owner_id, props.store.account()?.owner_epoch]);
  const active = () =>
    !disposed && props.store.activePage('reservations') && lifecycle() === 'active';
  const items = () =>
    (reservations.snapshot()?.items ?? []).filter((item) => item.online === (mode() === 'online'));
  let disposed = false;
  let generation = 0;
  let frame = 0;
  let list: ListRef | undefined;
  const modeRefs = new Map<Mode, ViewRef>();
  const refs = new Map<string, Set<ViewRef>>();
  const anchors = new Map<Mode, { id: string; offset: number }>();
  let waiting:
    | { id?: string; ids: string[]; kind: Action; scope: string; owns: () => boolean }
    | undefined;
  const guard = () => {
    const ownedScope = scope();
    const ownedGeneration = generation;
    const owns = props.store.focusGuard();
    return () => active() && scope() === ownedScope && generation === ownedGeneration && owns();
  };
  const restoreAnchor = () => {
    const anchor = anchors.get(mode());
    if (!active() || !anchor) return;
    const index = items().findIndex((item) => reservationItemId(item) === anchor.id);
    if (index >= 0) list?.scrollToIndex({ index, viewOffset: -anchor.offset, animated: false });
  };
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      const plan = waiting;
      if (!plan || !plan.owns() || plan.scope !== scope()) {
        waiting = undefined;
        return;
      }
      if (plan.id && !items().some((item) => reservationItemId(item) === plan.id)) {
        const index = Math.max(0, plan.ids.indexOf(plan.id));
        plan.id =
          [...plan.ids.slice(index), ...plan.ids.slice(0, index).reverse()].find((id) =>
            items().some((item) => reservationItemId(item) === id),
          ) ??
          (items()[0] && reservationItemId(items()[0]));
      }
      const item = items().find((item) => reservationItemId(item) === plan.id);
      if (plan.kind === 'open' && !item?.drama) plan.kind = 'cancel';
      if (plan.kind === 'cancel' && !item?.reservation_id) {
        if (item?.drama) plan.kind = 'open';
        else plan.id = undefined;
      }
      if (!plan.id) {
        waiting = undefined;
        modeRefs.get(mode())?.focus();
        return;
      }
      if (
        plan.kind === 'cancel' &&
        (reservations.loading() || reservations.busy() || reservations.stale())
      )
        return;
      const candidates = refs.get(`${plan.kind}:${plan.id}`);
      const viewport = await list?.measure();
      for (const ref of candidates ?? []) {
        const position = await ref.measure();
        if (
          !position ||
          !viewport ||
          position.bounds.size.width <= 0 ||
          position.bounds.size.height <= 0 ||
          position.pagePosition.y >= viewport.pagePosition.y + viewport.bounds.size.height ||
          position.pagePosition.y + position.bounds.size.height <= viewport.pagePosition.y
        )
          continue;
        if (waiting !== plan || !plan.owns() || plan.scope !== scope() || !candidates?.has(ref))
          return;
        waiting = undefined;
        ref.reveal({ vertical: 'nearest', horizontal: 'nearest', animated: false });
        ref.focus();
        return;
      }
    });
  };
  const register = (key: string, ref?: ViewRef, previous?: ViewRef) => {
    const candidates = refs.get(key) ?? new Set<ViewRef>();
    if (ref) candidates.add(ref);
    else if (previous) candidates.delete(previous);
    if (candidates.size) refs.set(key, candidates);
    else refs.delete(key);
    if (waiting && key === `${waiting.kind}:${waiting.id}`) reveal();
  };
  const capture = async () => {
    const owns = guard();
    const snapshot = reservations.snapshot();
    const ids = items().map(reservationItemId);
    const selected = mode();
    const position = await list?.measureScrollPosition();
    if (!owns() || snapshot !== reservations.snapshot()) return;
    const id = position && ids[position.index];
    if (id && position) anchors.set(selected, { id, offset: position.offset });
    const anchor = anchors.get(selected);
    return { ids, anchor: anchor && { ...anchor }, scope: scope(), generation, owns };
  };
  const restoreSource = (
    source: NonNullable<Awaited<ReturnType<typeof capture>>>,
    id: string,
    kind: Action,
  ) => {
    if (!active() || source.scope !== scope() || source.generation !== generation) return;
    const current = new Set(items().map(reservationItemId));
    const nearest = (key: string) => {
      const index = Math.max(0, source.ids.indexOf(key));
      return [...source.ids.slice(index), ...source.ids.slice(0, index).reverse()].find(
        (candidate) => current.has(candidate),
      );
    };
    const destination = nearest(id) ?? (items()[0] && reservationItemId(items()[0]));
    const anchorId = source.anchor && nearest(source.anchor.id);
    if (anchorId && source.anchor)
      anchors.set(mode(), { id: anchorId, offset: source.anchor.offset });
    else anchors.delete(mode());
    waiting = { id: destination, ids: source.ids, kind, scope: scope(), owns: guard() };
    restoreAnchor();
    reveal();
  };
  const openDetail = async (item: ReservationItem) => {
    if (!active() || !item.online || !item.drama) return;
    props.store.noteFocusIntent();
    const source = await capture();
    if (!source?.owns()) return;
    let returned = false;
    props.store.open(item.drama, () => {
      if (returned) return;
      returned = true;
      restoreSource(source, reservationItemId(item), 'open');
    });
  };
  const cancel = async (item: ReservationItem) => {
    if (
      !active() ||
      !item.reservation_id ||
      !reservations.snapshot() ||
      reservations.loading() ||
      reservations.busy() ||
      reservations.stale()
    )
      return;
    props.store.noteFocusIntent();
    const source = await capture();
    if (!source?.owns()) return;
    try {
      await reservations.set({ kind: 'item', id: item.reservation_id }, false);
      if (
        source.owns() &&
        !items().some((row) => reservationItemId(row) === reservationItemId(item))
      )
        restoreSource(source, reservationItemId(item), 'cancel');
    } catch {
      // The controller keeps the original uncertain target and its recovery state.
    }
  };
  let previousScope = scope();
  let previousMode = mode();
  let wasActive = false;
  effect(() => {
    const blocked = reservations.loading() || reservations.busy() || reservations.stale();
    void reservations.snapshot();
    if (waiting && !blocked) reveal();
  });
  effect(() => {
    const nextScope = scope();
    const nextMode = mode();
    const changed = nextScope !== previousScope;
    const modeChanged = nextMode !== previousMode;
    if (changed || modeChanged || lifecycle() !== 'active') {
      previousScope = nextScope;
      previousMode = nextMode;
      generation++;
      waiting = undefined;
      if (changed) anchors.clear();
      cancelAnimationFrame(frame);
    }
    const nextActive = active();
    if (nextActive && props.store.target === 'tv') {
      const primary = modeRefs.get(nextMode);
      if (primary) props.store.primaryRef('reservations', primary);
    }
    if (!nextActive) {
      waiting = undefined;
      cancelAnimationFrame(frame);
    } else if (!wasActive || modeChanged) {
      const owns = guard();
      frame = requestAnimationFrame(() => {
        if (!owns()) return;
        if (anchors.has(nextMode)) restoreAnchor();
        else list?.scrollToOffset({ offset: 0, animated: false });
      });
    }
    wasActive = nextActive;
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    refs.clear();
  });
  return (
    <View
      testID="reservations-page"
      class="flex-1"
      style={{
        ...(props.store.target === 'tv'
          ? { paddingTop: tvUnit(32) }
          : desktopContentFrame({ top: 24 })),
        gap: props.store.target === 'tv' ? tvUnit(16) : 16,
      }}
    >
      <View
        class="flex-row flex-wrap items-center justify-between"
        style={{ gap: props.store.target === 'tv' ? tvUnit(16) : 16 }}
      >
        <UiText role="page">预约</UiText>
        <Button
          label="刷新"
          icon="refresh-cw"
          testID="reservations-refresh"
          pending={reservations.loading()}
          disabled={!signedIn() || !active() || reservations.mutation()?.state === 'pending'}
          onPress={() => {
            if (active()) {
              props.store.noteFocusIntent();
              void reservations.refresh().catch(() => {});
            }
          }}
        />
      </View>
      <CardControls label="预约状态" onNavigate={props.store.noteFocusIntent}>
        <Each of={['upcoming', 'online'] as Mode[]} key={(value) => value}>
          {(value) => (
            <Button
              label={value() === 'online' ? '已上线' : '待上线'}
              selected={mode() === value()}
              testID={`reservations-mode-${value()}`}
              buttonRef={(ref) => {
                modeRefs.set(value(), ref);
                if (props.store.target === 'tv' && mode() === value())
                  props.store.primaryRef('reservations', ref);
              }}
              onPress={() => {
                props.store.noteFocusIntent();
                modeRefs.get(value())?.focus();
                mode.set(value());
              }}
            />
          )}
        </Each>
      </CardControls>
      <If when={!signedIn()}>
        <Notice message="登录后查看预约。" />
        <View class="self-start">
          <Button
            label="登录账号"
            testID="reservations-login"
            onPress={() => {
              props.store.noteFocusIntent();
              props.store.accountPage();
              props.store.restoreFocus();
            }}
          />
        </View>
      </If>
      <ReservationNotice store={props.store} active={active()} testID="reservations-state" />
      <If when={signedIn() && reservations.snapshot() && !items().length}>
        <Notice
          message={
            reservations.stale()
              ? `上次读取时没有${mode() === 'online' ? '已上线' : '待上线'}预约。`
              : `暂无${mode() === 'online' ? '已上线' : '待上线'}的预约。`
          }
        />
      </If>
      <If when={signedIn() && reservations.snapshot()}>
        <ContentArrival class="flex-1">
          <List
            ref={(ref) => {
              list = ref;
            }}
            testID="reservations-list"
            each={items()}
            keyExtractor={reservationItemId}
            estimatedItemSize={(props.store.target === 'tv' ? tvUnit(240) : 200) * fontScale()}
            class="flex-1"
            contentStyle={{ padding: 8, gap: props.store.target === 'tv' ? tvUnit(12) : 12 }}
            onLayout={() => {
              if (waiting) reveal();
            }}
            onScroll={() => {
              if (active()) void capture();
            }}
          >
            {(item) => (
              <ReservationRow
                item={item()}
                store={props.store}
                register={register}
                open={() => void openDetail(item())}
                cancel={() => void cancel(item())}
              />
            )}
          </List>
        </ContentArrival>
      </If>
    </View>
  );
}

function ReservationRow(props: {
  item: ReservationItem;
  store: Store;
  register: (key: string, ref?: ViewRef, previous?: ViewRef) => void;
  open: () => void;
  cancel: () => void;
}) {
  const references = new Map<Action, ViewRef>();
  const title = () => props.item.title || props.item.drama?.title || '内容暂不可用';
  const pending = () =>
    sameReservationTarget(props.store.reservations.mutation()?.target, {
      kind: 'item',
      id: props.item.reservation_id ?? '',
    }) && props.store.reservations.mutation()?.state === 'pending';
  effect(() => {
    const id = reservationItemId(props.item);
    for (const [kind, ref] of references) props.register(`${kind}:${id}`, ref);
    cleanup(() => {
      for (const [kind, ref] of references) props.register(`${kind}:${id}`, undefined, ref);
    });
  });
  const register = (kind: Action, ref: ViewRef) => {
    references.set(kind, ref);
    props.register(`${kind}:${reservationItemId(props.item)}`, ref);
  };
  return (
    <View
      testID={`reservations-row-${reservationItemId(props.item)}`}
      class="flex-row flex-wrap items-center border-b border-border"
      style={{
        gap: props.store.target === 'tv' ? tvUnit(20) : 20,
        paddingVertical: props.store.target === 'tv' ? tvUnit(20) : 20,
      }}
    >
      <View
        style={{
          width: props.store.target === 'tv' ? tvUnit(108) : 88,
          height: props.store.target === 'tv' ? tvUnit(152) : 112,
        }}
      >
        <Cover
          src={props.item.cover_fallback || props.item.cover}
          title={title()}
          class="w-full h-full"
        />
      </View>
      <View class="flex-1 min-w-0" style={{ gap: props.store.target === 'tv' ? tvUnit(12) : 12 }}>
        <UiText role="content-title">{title()}</UiText>
        <If when={reservationPublishLabel(props.item)}>
          <UiText tone="muted">{reservationPublishLabel(props.item)}</UiText>
        </If>
        <If when={props.item.tags.length}>
          <UiText role="meta" tone="muted">
            {props.item.tags.join(' · ')}
          </UiText>
        </If>
        <If when={props.item.intro}>
          <UiText role="meta" lines={3}>
            {props.item.intro}
          </UiText>
        </If>
        <CardControls
          label={`${title()}的预约操作`}
          onNavigate={props.store.noteFocusIntent}
          class="flex-wrap"
        >
          <If when={props.item.online && props.item.drama}>
            <Button
              label={`查看${title()}详情`}
              displayLabel="查看详情"
              testID={`reservations-open-${reservationItemId(props.item)}`}
              buttonRef={(ref) => register('open', ref)}
              onPress={props.open}
            />
          </If>
          <If when={props.item.reservation_id}>
            <Button
              label={`取消预约${title()}`}
              displayLabel="取消预约"
              testID={`reservations-cancel-${reservationItemId(props.item)}`}
              buttonRef={(ref) => register('cancel', ref)}
              pending={pending()}
              disabled={
                props.store.reservations.loading() ||
                props.store.reservations.busy() ||
                props.store.reservations.stale()
              }
              onPress={props.cancel}
            />
          </If>
        </CardControls>
        <If when={!props.item.reservation_id}>
          <UiText role="meta" tone="muted">
            暂时无法取消预约
          </UiText>
        </If>
      </View>
    </View>
  );
}
