import { List, View, cleanup, effect, fontScale, lifecycle, type ListRef, type ViewRef } from 'nsh';
import { Button, CardControls, ContentArrival, Cover, Notice, UiText, tvUnit } from '@hongguo/ui';
import type { FollowItem } from '@hongguo/core-client';
import type { Store } from '../store';
import { FollowNotice } from '../FollowAction';

/** These labels are remote observations, never local playback checkpoints or inferred schedules. */
export function followCaption(item: FollowItem): string {
  return [
    item.series_status === 'ended' ? '已完结' : item.series_status === 'ongoing' ? '连载中' : '',
    item.show_update_frequency,
    item.latest_watched_episode ? `上次看到第 ${item.latest_watched_episode} 集` : '',
    item.has_watched_latest_episode === true ? '已看到最新集' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function Following(props: { store: Store }) {
  const follow = props.store.follow;
  const signedIn = () => props.store.account()?.logged_in === true;
  const scope = () =>
    JSON.stringify([props.store.account()?.owner_id, props.store.account()?.owner_epoch]);
  const active = () => !disposed && props.store.activePage('following') && lifecycle() === 'active';
  const items = () => follow.snapshot()?.items ?? [];
  let disposed = false;
  let generation = 0;
  let frame = 0;
  let list: ListRef | undefined;
  let refreshRef: ViewRef | undefined;
  let loginRef: ViewRef | undefined;
  let emptyRef: ViewRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  const refs = new Map<string, Set<ViewRef>>();
  let waiting:
    | { id?: string; ids: string[]; kind: 'open' | 'cancel'; scope: string; owns: () => boolean }
    | undefined;
  const guard = () => {
    const ownedScope = scope();
    const ownedGeneration = generation;
    const owns = props.store.focusGuard();
    return () => active() && scope() === ownedScope && generation === ownedGeneration && owns();
  };
  const restoreAnchor = () => {
    if (!active() || !anchor) return;
    const index = items().findIndex((item) => item.series_id === anchor!.id);
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
      if (plan.id && !items().some((item) => item.series_id === plan.id)) {
        const index = Math.max(0, plan.ids.indexOf(plan.id));
        plan.id =
          [...plan.ids.slice(index), ...plan.ids.slice(0, index).reverse()].find((id) =>
            items().some((item) => item.series_id === id),
          ) ?? items()[0]?.series_id;
      }
      if (plan.kind === 'open' && !items().find((item) => item.series_id === plan.id)?.drama)
        plan.kind = 'cancel';
      if (plan.kind === 'cancel' && (follow.busy() || follow.stale())) return;
      if (!plan.id) {
        waiting = undefined;
        (items().length ? refreshRef : emptyRef)?.focus();
        return;
      }
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
    const snapshot = follow.snapshot();
    const ids = items().map((item) => item.series_id);
    const position = await list?.measureScrollPosition();
    if (!owns() || snapshot !== follow.snapshot()) return;
    const id = position && ids[position.index];
    if (id && position) anchor = { id, offset: position.offset };
    return { ids, anchor: anchor && { ...anchor }, scope: scope(), generation, owns };
  };
  const restoreSource = (
    source: NonNullable<Awaited<ReturnType<typeof capture>>>,
    id: string,
    kind: 'open' | 'cancel',
  ) => {
    if (!active() || source.scope !== scope() || source.generation !== generation) return;
    const current = new Set(items().map((item) => item.series_id));
    const nearest = (key: string) => {
      const index = Math.max(0, source.ids.indexOf(key));
      return [...source.ids.slice(index), ...source.ids.slice(0, index).reverse()].find(
        (candidate) => current.has(candidate),
      );
    };
    const destination = nearest(id) ?? items()[0]?.series_id;
    const anchorId = source.anchor && nearest(source.anchor.id);
    anchor = anchorId && source.anchor ? { id: anchorId, offset: source.anchor.offset } : undefined;
    const owns = guard();
    restoreAnchor();
    const item = items().find((item) => item.series_id === destination);
    waiting = {
      id: destination,
      ids: source.ids,
      kind: kind === 'open' && item?.drama ? 'open' : 'cancel',
      scope: scope(),
      owns,
    };
    reveal();
  };
  const openDetail = async (item: FollowItem) => {
    if (!active() || !item.drama) return;
    props.store.noteFocusIntent();
    const source = await capture();
    if (!source?.owns()) return;
    let returned = false;
    props.store.open(item.drama, () => {
      if (returned) return;
      returned = true;
      restoreSource(source, item.series_id, 'open');
    });
  };
  const cancel = async (item: FollowItem) => {
    if (!active() || follow.busy() || follow.stale()) return;
    props.store.noteFocusIntent();
    const source = await capture();
    if (!source?.owns()) return;
    try {
      await follow.set(item.series_id, false);
      if (source.owns() && !items().some((current) => current.series_id === item.series_id))
        restoreSource(source, item.series_id, 'cancel');
    } catch {
      // The shared controller retains errors and the original uncertain target.
    }
  };
  let previousScope = scope();
  let wasActive = false;
  effect(() => {
    if (
      props.store.target === 'tv' &&
      active() &&
      !follow.loading() &&
      follow.mutation()?.state !== 'pending'
    )
      props.store.primaryReady('following');
  });
  effect(() => {
    const blocked = follow.busy() || follow.stale();
    void follow.snapshot();
    if (waiting && !blocked) reveal();
  });
  effect(() => {
    const nextScope = scope();
    const changed = nextScope !== previousScope;
    if (changed || lifecycle() !== 'active') {
      previousScope = nextScope;
      generation++;
      waiting = undefined;
      if (changed) anchor = undefined;
      cancelAnimationFrame(frame);
    }
    const nextActive = active();
    if (nextActive && props.store.target === 'tv') {
      const primary = signedIn() ? refreshRef : loginRef;
      if (primary) props.store.primaryRef('following', primary);
    }
    if (!nextActive) {
      waiting = undefined;
      cancelAnimationFrame(frame);
    } else if (!wasActive) {
      const owns = guard();
      frame = requestAnimationFrame(() => {
        if (owns()) restoreAnchor();
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
      testID="following-page"
      class={`flex-1 ${props.store.target === 'desktop' ? 'px-10 pt-7 pb-8' : ''}`}
      style={{
        gap: props.store.target === 'tv' ? tvUnit(16) : 16,
        ...(props.store.target === 'tv' ? { paddingTop: tvUnit(32) } : {}),
      }}
    >
      <View
        class="flex-row flex-wrap items-center justify-between"
        style={{ gap: props.store.target === 'tv' ? tvUnit(16) : 16 }}
      >
        <UiText role="page">追更</UiText>
        <Button
          label="刷新"
          testID="following-refresh"
          icon="refresh-cw"
          pending={follow.loading()}
          disabled={!signedIn() || !active() || follow.mutation()?.state === 'pending'}
          buttonRef={(ref) => {
            refreshRef = ref;
            if (props.store.target === 'tv') props.store.primaryRef('following', ref);
          }}
          onPress={() => {
            if (active()) {
              props.store.noteFocusIntent();
              void follow.refresh().catch(() => {});
            }
          }}
        />
      </View>
      <If when={!signedIn()}>
        <Notice message="登录后查看追更。" />
        <View class="self-start">
          <Button
            label="登录账号"
            testID="following-login"
            primary
            buttonRef={(ref) => {
              loginRef = ref;
              if (props.store.target === 'tv') props.store.primaryRef('following', ref);
            }}
            onPress={() => {
              props.store.noteFocusIntent();
              props.store.accountPage();
              props.store.restoreFocus();
            }}
          />
        </View>
      </If>
      <FollowNotice store={props.store} active={active()} testID="following-state" />
      <If when={signedIn() && follow.snapshot() && !items().length}>
        <Notice message={follow.stale() ? '上次读取时没有追更。' : '暂时没有追更。'} />
        <View class="self-start">
          <Button
            label="去找剧"
            testID="following-empty-discover"
            buttonRef={(ref) => {
              emptyRef = ref;
            }}
            onPress={() => {
              props.store.noteFocusIntent();
              props.store.navigate('discover');
              props.store.restoreFocus();
            }}
          />
        </View>
      </If>
      <If when={signedIn() && follow.snapshot()}>
        <ContentArrival class="flex-1">
          <List
            ref={(ref) => {
              list = ref;
            }}
            testID="following-list"
            each={items()}
            keyExtractor={(item) => item.series_id}
            estimatedItemSize={(props.store.target === 'tv' ? tvUnit(228) : 180) * fontScale()}
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
              <FollowRow
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

function FollowRow(props: {
  item: FollowItem;
  store: Store;
  register: (key: string, ref?: ViewRef, previous?: ViewRef) => void;
  open: () => void;
  cancel: () => void;
}) {
  const references = new Map<'open' | 'cancel', ViewRef>();
  const title = () => props.item.drama?.title || '内容暂不可用';
  const pending = () =>
    props.store.follow.mutation()?.series_id === props.item.series_id &&
    props.store.follow.mutation()?.state === 'pending';
  effect(() => {
    const id = props.item.series_id;
    for (const [kind, ref] of references) props.register(`${kind}:${id}`, ref);
    cleanup(() => {
      for (const [kind, ref] of references) props.register(`${kind}:${id}`, undefined, ref);
    });
  });
  const register = (kind: 'open' | 'cancel', ref: ViewRef) => {
    references.set(kind, ref);
    props.register(`${kind}:${props.item.series_id}`, ref);
  };
  return (
    <View
      testID={`following-row-${props.item.series_id}`}
      style={{
        gap: props.store.target === 'tv' ? tvUnit(24) : 20,
        paddingVertical: props.store.target === 'tv' ? tvUnit(24) : 20,
      }}
      class="flex-row flex-wrap items-center border-b border-border"
    >
      <If when={props.item.drama}>
        <View
          style={{
            width: props.store.target === 'tv' ? tvUnit(108) : 88,
            height: props.store.target === 'tv' ? tvUnit(152) : 112,
          }}
        >
          <Cover
            src={props.item.drama?.cover_fallback || props.item.drama?.cover}
            title={title()}
            class="w-full h-full"
          />
        </View>
      </If>
      <View class="flex-1 min-w-0" style={{ gap: props.store.target === 'tv' ? tvUnit(12) : 12 }}>
        <UiText role="content-title">{title()}</UiText>
        <If when={followCaption(props.item)}>
          <UiText tone="muted">{followCaption(props.item)}</UiText>
        </If>
        <CardControls
          label={`${title()}的追更操作`}
          onNavigate={props.store.noteFocusIntent}
          class="flex-wrap"
        >
          <If when={props.item.drama}>
            <Button
              label={`查看${title()}详情`}
              displayLabel="查看详情"
              testID={`following-open-${props.item.series_id}`}
              buttonRef={(ref) => register('open', ref)}
              onPress={props.open}
            />
          </If>
          <Button
            label={`取消追更${title()}`}
            displayLabel="取消追更"
            testID={`following-cancel-${props.item.series_id}`}
            buttonRef={(ref) => register('cancel', ref)}
            pending={pending()}
            disabled={props.store.follow.busy() || props.store.follow.stale()}
            onPress={props.cancel}
          />
        </CardControls>
      </View>
    </View>
  );
}
