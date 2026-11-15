import {
  List,
  Text,
  View,
  effect,
  cleanup,
  lifecycle,
  signal,
  type ListRef,
  type ViewRef,
} from 'nsh';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Cover,
  Notice,
  Progress,
  ResultCard,
  Tabs,
  tvUnit,
} from '@hongguo/ui';
import type { FavoriteEntry, Library, LibraryKind } from '@hongguo/core-client';
import type { Store } from '../store';
import { historyProgress, playbackTime } from '../format';
import { errorMessage } from '../error-messages';
import { LibrarySyncNotice } from '../LibrarySyncNotice';

type Entry = Library['entries'][number];
type LibraryItem = Entry | FavoriteEntry;
export const historyLabel = (entry: LibraryItem) =>
  'favorite_at' in entry
    ? `${entry.drama.title} · 收藏`
    : `${entry.drama.title}${(entry.episode ?? 0) > 0 ? ` · 第 ${entry.episode} 集` : ''} · ${entry.completed ? '本集已看完' : playbackTime(entry.position)}`;
export function HistoryItem(props: {
  entry: LibraryItem;
  store: Store;
  register?: (id: string, ref?: ViewRef, previous?: ViewRef) => void;
  open?: (entry: LibraryItem) => void;
  managing?: boolean;
  checked?: boolean;
  disabled?: boolean;
  select?: (id: string, checked: boolean) => void;
  remove?: (entry: LibraryItem) => void;
  controlRef?: (key: string, ref?: ViewRef, previous?: ViewRef) => void;
}) {
  let ref: ViewRef | undefined;
  const selectRef = signal<ViewRef | undefined>(undefined);
  const removeRef = signal<ViewRef | undefined>(undefined);
  const progress = () => ('favorite_at' in props.entry ? undefined : props.entry);
  effect(() => {
    const id = props.entry.drama.series_id;
    if (ref) props.register?.(id, ref);
    const owned = ref;
    cleanup(() => props.register?.(id, undefined, owned));
  });
  effect(() => {
    const id = props.entry.drama.series_id;
    const nodes = props.managing ? { select: selectRef(), remove: removeRef() } : {};
    for (const [kind, node] of Object.entries(nodes))
      if (node) props.controlRef?.(`${kind}:${id}`, node);
    cleanup(() => {
      for (const [kind, node] of Object.entries(nodes))
        if (node) props.controlRef?.(`${kind}:${id}`, undefined, node);
    });
  });
  return (
    <ResultCard
      buttonRef={(node) => {
        ref = node;
        props.register?.(props.entry.drama.series_id, node);
      }}
      testID={`history-${props.entry.drama.series_id}`}
      label={historyLabel(props.entry)}
      selected={false}
      onPress={() => {
        if (props.open) props.open(props.entry);
        else props.store.open(props.entry.drama, () => ref?.focus());
      }}
    >
      <View
        style={{
          width: props.store.target === 'tv' ? tvUnit(108) : 88,
          height: props.store.target === 'tv' ? tvUnit(152) : 112,
        }}
      >
        <Cover
          src={props.entry.drama.cover_fallback || props.entry.drama.cover}
          title={props.entry.drama.title}
          class="w-full h-full"
        />
      </View>
      <View class="flex-1 min-w-0 justify-center gap-2">
        <If
          when={props.managing}
          else={
            <Text
              style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
              class={`${props.store.target === 'tv' ? 'text-xl' : 'text-base'} font-semibold text-foreground`}
            >
              {props.entry.drama.title}
            </Text>
          }
        >
          <Checkbox
            label={props.entry.drama.title}
            testID={`history-select-${props.entry.drama.series_id}`}
            checked={props.checked ?? false}
            disabled={props.disabled}
            controlRef={selectRef.set}
            onChange={(event) => props.select?.(props.entry.drama.series_id, event.checked)}
          />
        </If>
        <If when={progress()}>
          <Text
            style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
            class="text-sm text-muted-foreground"
          >
            {historyProgress(progress())}
          </Text>
        </If>
        <If when={(progress()?.duration ?? 0) > 0}>
          <View class="max-w-[220px]">
            <Progress position={progress()?.position ?? 0} duration={progress()?.duration} />
          </View>
        </If>
        <If when={props.managing}>
          <View class="flex-row">
            <Button
              label={
                progress()
                  ? `移除${props.entry.drama.title}的观看记录`
                  : `取消收藏${props.entry.drama.title}`
              }
              displayLabel={progress() ? '移除' : '取消收藏'}
              testID={`history-remove-${props.entry.drama.series_id}`}
              disabled={props.disabled}
              buttonRef={removeRef.set}
              onPress={() => props.remove?.(props.entry)}
            />
          </View>
        </If>
      </View>
    </ResultCard>
  );
}
export function LibraryStatus(props: {
  store: Store;
  kind?: LibraryKind;
  emptyRef?: (ref: ViewRef) => void;
}) {
  const favorites = () => props.kind === 'favorites';
  const empty = () =>
    !(favorites() ? props.store.favorites() : props.store.entries()).length &&
    props.store.library.state() === 'ready';
  return (
    <If when={props.store.library.loading() || props.store.library.error() || empty()}>
      <View class="gap-3">
        <If when={props.store.library.loading()}>
          <Text class="text-base text-muted-foreground">
            {favorites() ? '正在读取收藏…' : '正在读取观看记录…'}
          </Text>
        </If>
        <If when={errorMessage(props.store.library.error(), '记录加载失败')}>
          <Notice
            error
            message={errorMessage(props.store.library.error(), '记录加载失败')}
            retry={props.store.library.refetch}
          />
        </If>
        <If when={empty()}>
          <Notice message={favorites() ? '收藏的短剧会保存在这里。' : '看过的短剧会保存在这里。'} />
          <Button
            label="去找剧"
            testID="history-empty-discover"
            buttonRef={props.emptyRef}
            primary
            onPress={() => {
              props.store.navigate('discover');
              props.store.restoreFocus();
            }}
          />
        </If>
      </View>
    </If>
  );
}
type Confirmation = {
  kind: 'single' | 'selected' | 'clear';
  ids: string[];
  title: string;
  source: string;
  index: number;
  owner: string;
  scope: string;
  category: LibraryKind;
};

export function History(props: { store: Store }) {
  const managing = signal(false);
  const selected = signal<ReadonlySet<string>>(new Set());
  const confirmation = signal<Confirmation | undefined>(undefined);
  const localError = signal('');
  let list: ListRef | undefined;
  const anchors: Partial<Record<LibraryKind, { id: string; offset: number }>> = {};
  let frame = 0;
  let disposed = false;
  let epoch = 0;
  let focusEpoch = 0;
  let sourceEpoch = 0;
  let submitting = false;
  const dialogJob = signal<number | undefined>(undefined);
  let returnSource: { key: string; owner: string; epoch: number; owns: () => boolean } | undefined;
  let waiting: (NonNullable<typeof returnSource> & { align: 'center' | 'nearest' }) | undefined;
  const refs = new Map<string, ViewRef>();
  const rowRefs = new Map<string, Set<ViewRef>>();
  const category = () => props.store.libraryKind();
  const favorites = () => category() === 'favorites';
  const entries = (): LibraryItem[] =>
    favorites() ? props.store.favorites() : props.store.entries();
  const management = () =>
    favorites() ? props.store.favoritesManagement : props.store.historyManagement;
  const scope = () => JSON.stringify([owner(), props.store.account()?.owner_epoch ?? '']);
  const focusGuard = () => {
    const version = focusEpoch;
    const pageEpoch = epoch;
    const pageScope = scope();
    const pageCategory = category();
    const owns = props.store.focusGuard();
    return () =>
      present() &&
      pageEpoch === epoch &&
      pageScope === scope() &&
      pageCategory === category() &&
      version === focusEpoch &&
      lifecycle() !== 'background' &&
      owns();
  };
  const owner = () => props.store.library()?.owner_id ?? '';
  const present = () => !disposed && props.store.activePage('history');
  const enabled = () =>
    present() &&
    lifecycle() !== 'background' &&
    !!props.store.library() &&
    !!props.store.account() &&
    (props.store.account()?.owner_id ?? '') === owner();
  const operation = () => {
    const job = management().operation();
    return job?.ownerId === owner() ? job : undefined;
  };
  const outstanding = () =>
    [props.store.historyManagement.operation(), props.store.favoritesManagement.operation()].find(
      (job) => job?.ownerId === owner() && job?.status !== 'complete',
    );
  const busy = () => !!outstanding();
  const available = () => enabled() && !busy();
  const selectedIds = () =>
    entries()
      .map((entry) => entry.drama.series_id)
      .filter((id) => selected().has(id));
  const retryLabel = () =>
    operation()?.status === 'unresolved'
      ? favorites()
        ? '确认收藏处理结果'
        : '确认删除结果'
      : `重试剩余（${operation()?.remainingIds.length ?? 0}）`;
  const operationMessage = () => {
    const job = operation();
    if (!job || job.status === 'complete') return '';
    if (job.status === 'pending')
      return favorites()
        ? `正在处理收藏（${job.completedIds.length}/${job.ids.length}）…`
        : `正在删除观看记录（${job.completedIds.length}/${job.ids.length}）…`;
    if (job.status === 'unresolved')
      return favorites()
        ? '收藏处理结果尚未确认，请确认结果后再继续管理。'
        : '删除结果尚未确认，请确认结果后再继续管理。';
    return favorites()
      ? `已处理 ${job.completedIds.length} 条，还有 ${job.remainingIds.length} 条未处理。`
      : `已删除 ${job.completedIds.length} 条，还有 ${job.remainingIds.length} 条未删除。`;
  };
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(async () => {
      const plan = waiting;
      if (!plan) return;
      if (!present() || owner() !== plan.owner || epoch !== plan.epoch || !plan.owns()) {
        waiting = undefined;
        return;
      }
      const candidates = rowRefs.get(plan.key);
      let ref = refs.get(plan.key);
      if (candidates) {
        ref = undefined;
        const viewport = await list?.measure();
        for (const candidate of candidates) {
          const measured = await candidate.measure();
          if (
            measured &&
            viewport &&
            measured.bounds.size.width > 0 &&
            measured.bounds.size.height > 0 &&
            (plan.align === 'nearest'
              ? measured.pagePosition.y < viewport.pagePosition.y + viewport.bounds.size.height &&
                measured.pagePosition.y + measured.bounds.size.height > viewport.pagePosition.y
              : measured.pagePosition.y >= viewport.pagePosition.y + 4 &&
                measured.pagePosition.y + measured.bounds.size.height <=
                  viewport.pagePosition.y + viewport.bounds.size.height - 4)
          ) {
            ref = candidate;
            break;
          }
        }
      }
      if (
        waiting !== plan ||
        !present() ||
        owner() !== plan.owner ||
        epoch !== plan.epoch ||
        !plan.owns() ||
        (candidates && ref && !candidates.has(ref))
      )
        return;
      if (!ref) return; // Recycled cells retry on registration/layout.
      waiting = undefined;
      ref.reveal({ vertical: plan.align, horizontal: 'nearest', animated: false });
      ref.focus();
    });
  };
  const queueFocus = (key: string, owns = focusGuard(), align: 'center' | 'nearest' = 'center') => {
    if (!present() || !owns()) return;
    waiting = { key, owner: owner(), epoch, owns, align };
    const id = key.split(':')[1];
    const index = entries().findIndex((entry) => entry.drama.series_id === id);
    if (index >= 0 && align === 'center')
      list?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    reveal();
  };
  const register = (key: string, ref: ViewRef) => {
    refs.set(key, ref);
    if (waiting?.key === key) reveal();
  };
  const registerRow = (key: string, ref?: ViewRef, previous?: ViewRef) => {
    const candidates = rowRefs.get(key) ?? new Set<ViewRef>();
    if (ref) candidates.add(ref);
    else if (previous) candidates.delete(previous);
    // Recycling may briefly register the same identity in multiple cells.
    if (candidates.size) {
      rowRefs.set(key, candidates);
      register(key, candidates.values().next().value!);
    } else {
      rowRefs.delete(key);
      refs.delete(key);
    }
  };
  const restoreAnchor = (
    position: { id: string; offset: number } | undefined,
    owns = focusGuard(),
  ) => {
    if (!owns()) return;
    const index = position
      ? entries().findIndex((entry) => entry.drama.series_id === position.id)
      : 0;
    if (index >= 0 && entries().length)
      list?.scrollToIndex({ index, viewOffset: -(position?.offset ?? 0), animated: false });
  };
  const openDetail = async (item: LibraryItem) => {
    props.store.noteFocusIntent();
    const owns = focusGuard();
    const ownedScope = scope();
    const ownedCategory = category();
    const ownedSourceEpoch = sourceEpoch;
    const snapshot = props.store.library();
    const ids = entries().map((entry) => entry.drama.series_id);
    const position = await list?.measureScrollPosition();
    if (!owns() || snapshot !== props.store.library()) return;
    const anchorId = position && ids[position.index];
    const saved =
      anchorId && position ? { id: anchorId, offset: position.offset } : anchors[ownedCategory];
    if (saved) anchors[ownedCategory] = saved;
    let returned = false;
    props.store.open(item.drama, () => {
      if (
        returned ||
        !present() ||
        sourceEpoch !== ownedSourceEpoch ||
        scope() !== ownedScope ||
        category() !== ownedCategory
      )
        return;
      returned = true;
      const current = new Set(entries().map((entry) => entry.drama.series_id));
      const surviving = (id: string) => {
        const index = ids.indexOf(id);
        return [
          ...ids.slice(Math.max(0, index)),
          ...ids.slice(0, Math.max(0, index)).reverse(),
        ].find((candidate) => current.has(candidate));
      };
      const source = surviving(item.drama.series_id) ?? entries()[0]?.drama.series_id;
      const anchor = saved && surviving(saved.id);
      const restored = anchor ? { id: anchor, offset: saved!.offset } : undefined;
      if (restored) anchors[ownedCategory] = restored;
      const returnOwns = focusGuard();
      restoreAnchor(restored, returnOwns);
      queueFocus(source ? `detail:${source}` : 'empty', returnOwns, 'nearest');
    });
  };
  const toggleManaging = async () => {
    props.store.noteFocusIntent();
    const owns = focusGuard();
    const snapshot = props.store.library();
    const items = entries();
    const position = await list?.measureScrollPosition();
    if (!owns() || !enabled() || snapshot !== props.store.library()) return;
    const entry = position && items[position.index];
    if (entry && position)
      anchors[category()] = { id: entry.drama.series_id, offset: position.offset };
    const saved = anchors[category()];
    managing.set(!managing());
    selected.set(new Set());
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => restoreAnchor(saved, owns));
  };
  const close = () => {
    const current = confirmation();
    if (!current) return;
    returnSource = {
      key: current.source,
      owner: current.owner,
      epoch,
      owns: focusGuard(),
    };
    confirmation.set(undefined);
    localError.set('');
  };
  const restoreDialogSource = () => {
    const source = returnSource;
    returnSource = undefined; // Native close and the shared close frame may both call us.
    if (!source || source.owner !== owner() || source.epoch !== epoch) return;
    const sourceId = source.key.split(':')[1];
    const sourceExists = !sourceId || entries().some((entry) => entry.drama.series_id === sourceId);
    const key =
      operation()?.status === 'partial' || operation()?.status === 'unresolved'
        ? 'retry'
        : busy()
          ? 'manage'
          : sourceExists && refs.has(source.key)
            ? source.key
            : entries().length
              ? 'manage'
              : 'empty';
    queueFocus(key, source.owns);
  };
  const ask = (kind: Confirmation['kind'], ids: string[], title: string, source: string) => {
    if (!available() || !ids.length) return;
    props.store.noteFocusIntent();
    waiting = undefined;
    returnSource = undefined;
    dialogJob.set(undefined);
    localError.set('');
    confirmation.set({
      kind,
      ids: [...ids],
      title,
      source,
      index: Math.max(
        0,
        entries().findIndex((entry) => ids.includes(entry.drama.series_id)),
      ),
      owner: owner(),
      scope: scope(),
      category: category(),
    });
  };
  const run = async (retry = false) => {
    const current = confirmation();
    if (
      submitting ||
      !enabled() ||
      (current && (current.scope !== scope() || current.category !== category()))
    )
      return;
    if (!retry && (!current || !available())) return;
    const job = operation();
    if (retry && (!job || !['partial', 'unresolved'].includes(job.status))) return;
    const index =
      current?.index ??
      Math.max(
        0,
        entries().findIndex((entry) => job!.remainingIds.includes(entry.drama.series_id)),
      );
    submitting = true;
    localError.set('');
    const ownedEpoch = epoch;
    const owns = focusGuard();
    try {
      const result = retry
        ? management().retry(job!.id)
        : current!.kind === 'clear'
          ? management().clear()
          : management().remove(current!.ids);
      dialogJob.set(management().operation()?.id);
      await result;
      const settled = operation();
      if (settled?.status !== 'complete' || settled.id !== dialogJob()) return;
      selected.set(new Set(selectedIds()));
      if (confirmation() !== current || ownedEpoch !== epoch || !enabled()) return;
      const items = entries();
      const survivor = items[Math.min(index, items.length - 1)];
      if (!items.length) managing.set(false);
      returnSource = undefined;
      confirmation.set(undefined);
      // Wait for the native dialog to release focus, then restore only if no newer input won.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (epoch === ownedEpoch && owns())
          queueFocus(survivor ? `detail:${survivor.drama.series_id}` : 'empty', owns);
      });
    } catch (cause) {
      if (ownedEpoch === epoch)
        localError.set(
          errorMessage(cause, favorites() ? '暂时无法处理收藏' : '暂时无法删除观看记录'),
        );
    } finally {
      submitting = false;
    }
  };
  let previousScope: string | undefined;
  let previousCategory: LibraryKind | undefined;
  let previousActive = false;
  effect(() => {
    if (lifecycle() !== 'background') return;
    focusEpoch++;
    waiting = undefined;
    returnSource = undefined;
    cancelAnimationFrame(frame);
  });
  effect(() => {
    const current = selected();
    const ids = new Set(entries().map((entry) => entry.drama.series_id));
    const next = new Set([...current].filter((id) => ids.has(id)));
    if (next.size !== current.size) selected.set(next);
  });
  effect(() => {
    const active = props.store.activePage('history');
    const currentScope = props.store.library() ? scope() : undefined;
    const currentCategory = category();
    const ownerChanged = previousScope !== currentScope;
    const categoryChanged = previousCategory !== currentCategory;
    if (ownerChanged || categoryChanged) sourceEpoch++;
    if (ownerChanged) {
      delete anchors.history;
      delete anchors.favorites;
    }
    if (!active || ownerChanged || categoryChanged) {
      epoch++;
      managing.set(false);
      selected.set(new Set());
      confirmation.set(undefined);
      waiting = undefined;
      returnSource = undefined;
      localError.set('');
      cancelAnimationFrame(frame);
    }
    if (active && (!previousActive || categoryChanged || ownerChanged)) {
      const owns = focusGuard();
      const saved = anchors[currentCategory];
      frame = requestAnimationFrame(() => restoreAnchor(saved, owns));
    }
    previousScope = currentScope;
    previousCategory = currentCategory;
    previousActive = active;
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    refs.clear();
    rowRefs.clear();
  });
  return (
    <View
      testID="history-page"
      class={`flex-1 gap-4 ${props.store.target === 'tv' ? '' : 'px-10 pt-7 pb-8'}`}
      style={props.store.target === 'tv' ? { paddingTop: tvUnit(32) } : undefined}
    >
      <View class="flex-row flex-wrap items-center justify-between gap-4">
        <Text
          role="header"
          accessibilityLevel={1}
          style={props.store.target === 'tv' ? { fontSize: tvUnit(44) } : { fontSize: 32 }}
          class={`${props.store.target === 'tv' ? 'text-4xl' : 'text-3xl'} font-semibold text-foreground`}
        >
          我的片库
        </Text>
        <Button
          testID="history-manage"
          label={managing() ? '完成' : '管理'}
          buttonRef={(ref) => register('manage', ref)}
          disabled={!enabled() || (!managing() && !entries().length)}
          onPress={() => void toggleManaging()}
        />
      </View>
      <Tabs
        label="片库"
        testID="library-tabs"
        value={category()}
        options={[
          { value: 'history', label: '观看记录' },
          { value: 'favorites', label: '收藏' },
        ]}
        onChange={(event) => {
          if (event.value === category()) return;
          props.store.noteFocusIntent();
          props.store.libraryKind.set(event.value === 'favorites' ? 'favorites' : 'history');
        }}
      />
      <LibrarySyncNotice store={props.store} active={present()} testID="history-library-sync" />
      <If when={managing()}>
        <View class="flex-row flex-wrap items-center gap-3">
          <Checkbox
            label="全选"
            testID="history-select-all"
            checked={!!entries().length && selectedIds().length === entries().length}
            indeterminate={selectedIds().length > 0 && selectedIds().length < entries().length}
            disabled={!available() || !entries().length}
            onChange={(event) => {
              props.store.noteFocusIntent();
              selected.set(
                new Set(event.checked ? entries().map((entry) => entry.drama.series_id) : []),
              );
            }}
          />
          <Button
            testID="history-delete-selected"
            label={
              favorites()
                ? `取消收藏所选（${selectedIds().length}）`
                : `删除所选（${selectedIds().length}）`
            }
            disabled={!available() || !selectedIds().length}
            buttonRef={(ref) => register('selected', ref)}
            onPress={() =>
              ask(
                'selected',
                selectedIds(),
                favorites() ? '取消收藏所选短剧？' : '删除所选观看记录？',
                'selected',
              )
            }
          />
          <Button
            testID="history-clear"
            label={favorites() ? '清空本机收藏' : '清空本机记录'}
            disabled={!available() || !entries().length}
            buttonRef={(ref) => register('clear', ref)}
            onPress={() =>
              ask(
                'clear',
                entries().map((entry) => entry.drama.series_id),
                favorites() ? '清空本机收藏？' : '清空本机观看记录？',
                'clear',
              )
            }
          />
        </View>
      </If>
      <If when={busy() && (!operation() || operation()?.status === 'complete')}>
        <Notice message="另一栏目仍有未完成的管理操作，请切换栏目确认。" />
      </If>
      <If when={operationMessage() || localError()}>
        <View testID="history-operation" class="gap-3">
          <Notice
            message={localError() || operationMessage()}
            error={!!localError() || operation()?.status !== 'pending'}
          />
          <If when={operation()?.status === 'partial' || operation()?.status === 'unresolved'}>
            <View class="flex-row">
              <Button
                testID="history-operation-retry"
                label={retryLabel()}
                disabled={!enabled()}
                buttonRef={(ref) => register('retry', ref)}
                onFocusedRemoval={() => {
                  if (enabled()) refs.get('manage')?.focus();
                }}
                onPress={() => {
                  props.store.noteFocusIntent();
                  void run(true);
                }}
              />
            </View>
          </If>
        </View>
      </If>
      <LibraryStatus
        store={props.store}
        kind={category()}
        emptyRef={(ref) => register('empty', ref)}
      />
      <List
        ref={(ref) => {
          list = ref;
        }}
        onLayout={() => {
          if (waiting) reveal();
        }}
        onScroll={() => {
          if (!props.store.activePage('history')) return;
          const snapshot = props.store.library();
          const items = entries();
          const currentCategory = category();
          const pageEpoch = epoch;
          void list?.measureScrollPosition().then((position) => {
            const entry = position && items[position.index];
            if (
              present() &&
              epoch === pageEpoch &&
              snapshot === props.store.library() &&
              entry &&
              position
            )
              anchors[currentCategory] = { id: entry.drama.series_id, offset: position.offset };
          });
        }}
        testID="history-list"
        each={entries()}
        keyExtractor={(entry) => `${category()}:${entry.drama.series_id}`}
        estimatedItemSize={
          props.store.target === 'tv' ? tvUnit(managing() ? 270 : 202) : managing() ? 210 : 154
        }
        class="flex-1"
        contentStyle={{ gap: props.store.target === 'tv' ? tvUnit(12) : 12, padding: 8 }}
      >
        {(entry) => (
          <HistoryItem
            entry={entry()}
            store={props.store}
            managing={managing()}
            checked={selected().has(entry().drama.series_id)}
            disabled={!available()}
            select={(id, checked) => {
              props.store.noteFocusIntent();
              const next = new Set(selected());
              if (checked) next.add(id);
              else next.delete(id);
              selected.set(next);
            }}
            remove={(item) =>
              ask(
                'single',
                [item.drama.series_id],
                favorites()
                  ? `取消收藏《${item.drama.title}》？`
                  : `移除《${item.drama.title}》的观看记录？`,
                `remove:${item.drama.series_id}`,
              )
            }
            controlRef={registerRow}
            register={(id, ref, previous) => {
              registerRow(`detail:${id}`, ref, previous);
            }}
            open={(item) => void openDetail(item)}
          />
        )}
      </List>
      <ConfirmDialog
        testID="history-confirm"
        open={!!confirmation()}
        title={confirmation()?.title ?? '删除观看记录？'}
        description={
          favorites()
            ? confirmation()?.kind === 'clear'
              ? owner()
                ? '仅清空本机收藏，不取消账号云端收藏；观看记录保留。'
                : '仅清空本机收藏，观看记录保留。'
              : owner()
                ? '取消收藏会同步到当前账号；观看记录保留。'
                : '从本机收藏移除，观看记录保留。'
            : confirmation()?.kind === 'single'
              ? '仅删除本机观看记录和已保存的观看位置，再次播放会重新记录。'
              : `将删除本机 ${confirmation()?.ids.length ?? 0} 条观看记录和已保存的观看位置，再次播放会重新记录。`
        }
        destructive
        pending={operation()?.id === dialogJob() && operation()?.status === 'pending'}
        cancelLabel={
          operation()?.id === dialogJob() && operation()?.status === 'pending' ? '关闭' : '取消'
        }
        confirmLabel={
          operation()?.id === dialogJob() &&
          ['partial', 'unresolved'].includes(operation()?.status ?? '')
            ? retryLabel()
            : confirmation()?.kind === 'clear'
              ? favorites()
                ? '清空本机收藏'
                : '清空本机记录'
              : favorites()
                ? '取消收藏'
                : confirmation()?.kind === 'single'
                  ? '移除记录'
                  : '删除记录'
        }
        error={
          localError() ||
          (operation()?.id === dialogJob() && operation()?.status !== 'pending'
            ? operation()?.error
            : '')
        }
        onOpenChange={(event) => {
          if (!event.open) close();
        }}
        returnFocus={restoreDialogSource}
        onConfirm={() =>
          void run(
            operation()?.id === dialogJob() &&
              ['partial', 'unresolved'].includes(operation()?.status ?? ''),
          )
        }
      />
    </View>
  );
}
