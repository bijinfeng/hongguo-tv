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
  tvUnit,
} from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import type { Store } from '../store';
import { playbackTime } from '../format';
import { errorMessage } from '../error-messages';

type Entry = Library['entries'][number];
export const historyLabel = (entry: Entry) =>
  `${entry.drama.title} · 第 ${entry.episode ?? 1} 集 · ${entry.completed ? '本集已看完' : playbackTime(entry.position)}`;
export function HistoryItem(props: {
  entry: Entry;
  store: Store;
  register?: (id: string, ref?: ViewRef, previous?: ViewRef) => void;
  restore?: (id: string) => void;
  managing?: boolean;
  checked?: boolean;
  disabled?: boolean;
  select?: (id: string, checked: boolean) => void;
  remove?: (entry: Entry) => void;
  controlRef?: (key: string, ref?: ViewRef, previous?: ViewRef) => void;
}) {
  let ref: ViewRef | undefined;
  const selectRef = signal<ViewRef | undefined>(undefined);
  const removeRef = signal<ViewRef | undefined>(undefined);
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
        const drama = props.entry.drama;
        props.store.open(drama, () => {
          if (props.restore) props.restore(drama.series_id);
          else ref?.focus();
        });
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
        <Text
          style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          class="text-sm text-muted-foreground"
        >{`第 ${props.entry.episode ?? 1} 集 · 看到 ${playbackTime(props.entry.position)}`}</Text>
        <If when={props.entry.duration && props.entry.duration > 0}>
          <View class="max-w-[220px]">
            <Progress position={props.entry.position ?? 0} duration={props.entry.duration} />
          </View>
        </If>
        <If when={props.entry.completed}>
          <Text
            style={props.store.target === 'tv' ? { fontSize: tvUnit(20) } : undefined}
            class="text-base text-muted-foreground"
          >
            本集已看完
          </Text>
        </If>
        <If when={props.managing}>
          <View class="flex-row">
            <Button
              label={`移除${props.entry.drama.title}的观看记录`}
              displayLabel="移除"
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
export function LibraryStatus(props: { store: Store; emptyRef?: (ref: ViewRef) => void }) {
  return (
    <If
      when={
        props.store.library.loading() ||
        props.store.library.error() ||
        (!props.store.entries().length && props.store.library.state() === 'ready')
      }
    >
      <View class="gap-3">
        <If when={props.store.library.loading()}>
          <Text class="text-base text-muted-foreground">正在读取观看记录…</Text>
        </If>
        <If when={errorMessage(props.store.library.error(), '记录加载失败')}>
          <Notice
            error
            message={errorMessage(props.store.library.error(), '记录加载失败')}
            retry={props.store.library.refetch}
          />
        </If>
        <If when={!props.store.entries().length && props.store.library.state() === 'ready'}>
          <Notice message="看过的短剧会保存在这里。" />
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
};

export function History(props: { store: Store }) {
  const managing = signal(false);
  const selected = signal<ReadonlySet<string>>(new Set());
  const confirmation = signal<Confirmation | undefined>(undefined);
  const localError = signal('');
  let list: ListRef | undefined;
  let anchor: { id: string; offset: number } | undefined;
  let frame = 0;
  let disposed = false;
  let epoch = 0;
  let focusEpoch = 0;
  let submitting = false;
  const dialogJob = signal<number | undefined>(undefined);
  let returnSource: { key: string; owner: string; epoch: number; owns: () => boolean } | undefined;
  let waiting: typeof returnSource;
  const refs = new Map<string, ViewRef>();
  const rowRefs = new Map<string, Set<ViewRef>>();
  const focusGuard = () => {
    const version = focusEpoch;
    const pageEpoch = epoch;
    const pageOwner = owner();
    const owns = props.store.focusGuard();
    return () =>
      present() &&
      pageEpoch === epoch &&
      pageOwner === owner() &&
      version === focusEpoch &&
      lifecycle() !== 'background' &&
      owns();
  };
  const owner = () => props.store.library()?.owner_id ?? '';
  const present = () => !disposed && props.store.activePage('history');
  const enabled = () => present() && !!props.store.library() && owner() === '';
  const operation = () => {
    const job = props.store.historyManagement.operation();
    return job?.ownerId === owner() ? job : undefined;
  };
  const busy = () => !!operation() && operation()!.status !== 'complete';
  const available = () => enabled() && !busy();
  const selectedIds = () =>
    props.store
      .entries()
      .map((entry) => entry.drama.series_id)
      .filter((id) => selected().has(id));
  const retryLabel = () =>
    operation()?.status === 'unresolved'
      ? '确认删除结果'
      : `重试剩余（${operation()?.remainingIds.length ?? 0}）`;
  const operationMessage = () => {
    const job = operation();
    if (!job || job.status === 'complete') return '';
    if (job.status === 'pending')
      return `正在删除观看记录（${job.completedIds.length}/${job.ids.length}）…`;
    if (job.status === 'unresolved') return '删除结果尚未确认，请确认结果后再继续管理。';
    return `已删除 ${job.completedIds.length} 条，还有 ${job.remainingIds.length} 条未删除。`;
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
            measured.pagePosition.y >= viewport.pagePosition.y + 4 &&
            measured.pagePosition.y + measured.bounds.size.height <=
              viewport.pagePosition.y + viewport.bounds.size.height - 4
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
      ref.reveal({ vertical: 'center', horizontal: 'nearest', animated: false });
      ref.focus();
    });
  };
  const queueFocus = (key: string, owns = focusGuard()) => {
    if (!present() || !owns()) return;
    waiting = { key, owner: owner(), epoch, owns };
    const id = key.split(':')[1];
    const index = props.store.entries().findIndex((entry) => entry.drama.series_id === id);
    if (index >= 0) list?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
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
  const restoreAnchor = (position = anchor, owns = focusGuard()) => {
    if (!position || !owns()) return;
    const index = props.store.entries().findIndex((entry) => entry.drama.series_id === position.id);
    if (index >= 0) list?.scrollToIndex({ index, viewOffset: -position.offset, animated: false });
  };
  const toggleManaging = async () => {
    props.store.noteFocusIntent();
    const owns = focusGuard();
    const snapshot = props.store.library();
    const entries = props.store.entries();
    const position = await list?.measureScrollPosition();
    if (!owns() || !enabled() || snapshot !== props.store.library()) return;
    const entry = position && entries[position.index];
    if (entry && position) anchor = { id: entry.drama.series_id, offset: position.offset };
    const saved = anchor;
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
    const sourceExists =
      !sourceId || props.store.entries().some((entry) => entry.drama.series_id === sourceId);
    const key =
      operation()?.status === 'partial' || operation()?.status === 'unresolved'
        ? 'retry'
        : busy()
          ? 'manage'
          : sourceExists && refs.has(source.key)
            ? source.key
            : props.store.entries().length
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
        props.store.entries().findIndex((entry) => ids.includes(entry.drama.series_id)),
      ),
      owner: owner(),
    });
  };
  const run = async (retry = false) => {
    const current = confirmation();
    if (submitting || !enabled() || (current && current.owner !== owner())) return;
    if (!retry && (!current || !available())) return;
    const job = operation();
    if (retry && (!job || !['partial', 'unresolved'].includes(job.status))) return;
    const index =
      current?.index ??
      Math.max(
        0,
        props.store
          .entries()
          .findIndex((entry) => job!.remainingIds.includes(entry.drama.series_id)),
      );
    submitting = true;
    localError.set('');
    const ownedEpoch = epoch;
    const owns = focusGuard();
    try {
      const result = retry
        ? props.store.historyManagement.retry(job!.id)
        : current!.kind === 'clear'
          ? props.store.historyManagement.clear()
          : props.store.historyManagement.remove(current!.ids);
      dialogJob.set(props.store.historyManagement.operation()?.id);
      await result;
      const settled = operation();
      if (settled?.status !== 'complete' || settled.id !== dialogJob()) return;
      selected.set(new Set(selectedIds()));
      if (confirmation() !== current || ownedEpoch !== epoch || !enabled()) return;
      const entries = props.store.entries();
      const survivor = entries[Math.min(index, entries.length - 1)];
      if (!entries.length) managing.set(false);
      returnSource = undefined;
      confirmation.set(undefined);
      // Wait for the native dialog to release focus, then restore only if no newer input won.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (epoch === ownedEpoch && owns())
          queueFocus(survivor ? `detail:${survivor.drama.series_id}` : 'empty', owns);
      });
    } catch (cause) {
      if (ownedEpoch === epoch) localError.set(errorMessage(cause, '暂时无法删除观看记录'));
    } finally {
      submitting = false;
    }
  };
  let previousOwner: string | undefined;
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
    const ids = new Set(props.store.entries().map((entry) => entry.drama.series_id));
    const next = new Set([...current].filter((id) => ids.has(id)));
    if (next.size !== current.size) selected.set(next);
  });
  effect(() => {
    const active = props.store.activePage('history');
    const currentOwner = props.store.library() ? owner() : undefined;
    if (!active || previousOwner !== currentOwner) {
      epoch++;
      managing.set(false);
      selected.set(new Set());
      confirmation.set(undefined);
      waiting = undefined;
      returnSource = undefined;
      localError.set('');
      cancelAnimationFrame(frame);
    }
    if (active && !previousActive) {
      const owns = focusGuard();
      frame = requestAnimationFrame(() => restoreAnchor(anchor, owns));
    }
    previousOwner = currentOwner;
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
          继续观看
        </Text>
        <Button
          testID="history-manage"
          label={managing() ? '完成' : '管理'}
          buttonRef={(ref) => register('manage', ref)}
          disabled={!enabled() || (!managing() && !props.store.entries().length)}
          onPress={() => void toggleManaging()}
        />
      </View>
      <If when={managing()}>
        <View class="flex-row flex-wrap items-center gap-3">
          <Checkbox
            label="全选"
            testID="history-select-all"
            checked={
              !!props.store.entries().length &&
              selectedIds().length === props.store.entries().length
            }
            indeterminate={
              selectedIds().length > 0 && selectedIds().length < props.store.entries().length
            }
            disabled={!available() || !props.store.entries().length}
            onChange={(event) => {
              props.store.noteFocusIntent();
              selected.set(
                new Set(
                  event.checked ? props.store.entries().map((entry) => entry.drama.series_id) : [],
                ),
              );
            }}
          />
          <Button
            testID="history-delete-selected"
            label={`删除所选（${selectedIds().length}）`}
            disabled={!available() || !selectedIds().length}
            buttonRef={(ref) => register('selected', ref)}
            onPress={() => ask('selected', selectedIds(), '删除所选观看记录？', 'selected')}
          />
          <Button
            testID="history-clear"
            label="清空本机记录"
            disabled={!available() || !props.store.entries().length}
            buttonRef={(ref) => register('clear', ref)}
            onPress={() =>
              ask(
                'clear',
                props.store.entries().map((entry) => entry.drama.series_id),
                '清空本机观看记录？',
                'clear',
              )
            }
          />
        </View>
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
                  if (present()) refs.get('manage')?.focus();
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
      <LibraryStatus store={props.store} emptyRef={(ref) => register('empty', ref)} />
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
          const entries = props.store.entries();
          const pageEpoch = epoch;
          void list?.measureScrollPosition().then((position) => {
            const entry = position && entries[position.index];
            if (
              present() &&
              epoch === pageEpoch &&
              snapshot === props.store.library() &&
              entry &&
              position
            )
              anchor = { id: entry.drama.series_id, offset: position.offset };
          });
        }}
        testID="history-list"
        each={props.store.entries()}
        keyExtractor={(entry) => entry.drama.series_id}
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
                `移除《${item.drama.title}》的观看记录？`,
                `remove:${item.drama.series_id}`,
              )
            }
            controlRef={registerRow}
            register={(id, ref, previous) => {
              registerRow(`detail:${id}`, ref, previous);
            }}
            restore={(id) => queueFocus(`detail:${id}`)}
          />
        )}
      </List>
      <ConfirmDialog
        testID="history-confirm"
        open={!!confirmation()}
        title={confirmation()?.title ?? '删除观看记录？'}
        description={
          confirmation()?.kind === 'single'
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
              ? '清空本机记录'
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
