import { Text, View, signal, type ViewRef } from 'nsh';
import { Button, type ProductTarget } from '@hongguo/ui';
import type { Library, LibraryKind } from '@hongguo/core-client';
import { History } from '../src/pages/History';
import type { HistoryOperation } from '../src/library-state';
import type { Store } from '../src/store';

const first = '9007199254740992';
const second = '9007199254740993';
const initial: Library = {
  owner_id: '',
  favorites: Array.from({ length: 14 }, (_, index) => ({
    drama: {
      series_id: index === 0 ? first : index === 1 ? second : String(8000 + index),
      title: `合成收藏${index + 1}`,
      cover: '',
      intro: '',
    },
    favorite_at: 100 - index,
  })),
  entries: Array.from({ length: 14 }, (_, index) => ({
    drama: {
      series_id: index === 0 ? first : index === 1 ? second : String(8000 + index),
      title:
        index === 1
          ? '合成的很长很长的短剧名称，用来检查管理模式的完整复选框名称'
          : `合成观看记录${index + 1}`,
      cover: '',
      intro: '',
    },
    episode: index + 1,
    position: 30,
    duration: 120,
    last_played_at: 100 - index,
  })),
};

/** Explicit synthetic edge regression around the production History component.
 * Real playback, transport receipts and persistence are owned by host acceptance.
 */
export function HistoryManagementStateFixture(props: { target: ProductTarget }) {
  const snapshot = signal<Library | undefined>(initial);
  const active = signal(true);
  const account = signal({ owner_id: '', owner_epoch: 'a'.repeat(32) });
  const libraryKind = signal<LibraryKind>('history');
  const job = signal<HistoryOperation | undefined>(undefined);
  const completedHistory = signal<HistoryOperation | undefined>(undefined);
  const completedFavorites = signal<HistoryOperation | undefined>(undefined);
  let jobCategory: LibraryKind = 'history';
  const mode = signal<'success' | 'partial' | 'unresolved' | 'slow' | 'interrupt'>('success');
  const calls = signal<string[]>([]);
  const opened = signal('none');
  const alternatePresses = signal(0);
  const alternateFocused = signal(false);
  const detailFlow = signal(false);
  let detailSource: (() => void) | undefined;
  let alternate: ViewRef | undefined;
  let sequence = 0;
  let intent = 0;
  const entries = () => snapshot()?.entries ?? [];
  const items = (category: LibraryKind) =>
    category === 'history' ? entries() : (snapshot()?.favorites ?? []);
  const publish = (ids: readonly string[], category: LibraryKind = 'history') => {
    const current = snapshot();
    if (current)
      snapshot.set({
        ...current,
        entries:
          category === 'history'
            ? current.entries.filter((entry) => !ids.includes(entry.drama.series_id))
            : current.entries,
        favorites:
          category === 'favorites'
            ? current.favorites.filter((entry) => !ids.includes(entry.drama.series_id))
            : current.favorites,
      });
  };
  const settle = async (current: HistoryOperation, category: LibraryKind, retry = false) => {
    await new Promise<void>((resolve) => setTimeout(resolve, mode() === 'slow' ? 500 : 30));
    if (retry && current.status === 'unresolved') {
      job.set({ ...current, status: 'partial', error: '合成回执确认原删除失败' });
      return;
    }
    const ids = current.remainingIds;
    if (!retry && mode() === 'partial') {
      const completed = ids.slice(0, 1);
      publish(completed, category);
      job.set({
        ...current,
        completedIds: completed,
        remainingIds: ids.slice(1),
        status: 'partial',
        error: '合成存储失败',
      });
    } else if (!retry && mode() === 'unresolved') {
      job.set({ ...current, status: 'unresolved', error: '合成回执丢失' });
    } else {
      publish(ids, category);
      const complete: HistoryOperation = {
        ...current,
        completedIds: current.ids,
        remainingIds: [],
        status: 'complete',
        error: '',
      };
      (category === 'history' ? completedHistory : completedFavorites).set(complete);
      job.set(complete);
      if (mode() === 'interrupt')
        requestAnimationFrame(() => {
          intent++;
          alternate?.focus();
        });
    }
  };
  const start = (category: LibraryKind, kind: 'remove' | 'clear', ids: readonly string[]) => {
    if (!snapshot() || snapshot()?.owner_id !== account().owner_id)
      throw new Error('合成 owner 不可管理');
    const current = job();
    if (current && current.status !== 'complete') return Promise.resolve();
    const exact = items(category)
      .map((entry) => entry.drama.series_id)
      .filter((id) => ids.includes(id));
    calls.update((items) => [
      ...items,
      `${category === 'favorites' ? 'favorites:' : ''}${kind}:${exact.join(',')}`,
    ]);
    const next: HistoryOperation = {
      id: ++sequence,
      ownerId: account().owner_id,
      kind,
      ids: exact,
      completedIds: [],
      remainingIds: exact,
      status: 'pending',
      error: '',
    };
    jobCategory = category;
    job.set(next);
    return settle(next, category);
  };
  const library = Object.assign(() => snapshot(), {
    state: () => (snapshot() ? ('ready' as const) : ('loading' as const)),
    loading: () => !snapshot(),
    error: () => undefined,
    refetch: async () => {},
  });
  const management = (category: LibraryKind) => ({
    operation: () =>
      jobCategory === category
        ? job()
        : (category === 'history' ? completedHistory : completedFavorites)(),
    remove: (ids: readonly string[]) => start(category, 'remove', ids),
    clear: () =>
      start(
        category,
        'clear',
        items(category).map((entry) => entry.drama.series_id),
      ),
    retry: (id: number) => {
      const current = job();
      if (!current || id !== current.id || jobCategory !== category) return Promise.resolve();
      calls.update((items) => [
        ...items,
        `retry:${current.status}:${current.remainingIds.join(',')}`,
      ]);
      job.set({ ...current, status: 'pending', error: '' });
      return settle(current, category, true);
    },
  });
  const ports = {
    target: props.target,
    library,
    entries,
    favorites: () => snapshot()?.favorites ?? [],
    account,
    libraryKind,
    activePage: (name: string) => name === 'history' && active(),
    noteFocusIntent: () => {
      intent++;
    },
    focusGuard: () => {
      const owned = intent;
      return () => owned === intent;
    },
    focusPrimary() {},
    restoreFocus() {},
    navigate: (name: string) => opened.set(name),
    open: (drama: { series_id: string }, restore?: () => void) => {
      opened.set(drama.series_id);
      if (detailFlow()) {
        detailSource = restore;
        active.set(false);
      }
    },
    historyManagement: management('history'),
    favoritesManagement: management('favorites'),
  } as unknown as Store;
  return (
    <>
      <View class="flex-1 bg-background gap-3 p-4">
        <View class="flex-row flex-wrap gap-3">
          <Each of={['success', 'partial', 'unresolved', 'slow', 'interrupt'] as const}>
            {(value) => (
              <Button
                testID={`history-fixture-${value()}`}
                label={`合成 ${value()}`}
                onPress={() => mode.set(value())}
              />
            )}
          </Each>
          <Button
            testID="history-fixture-alternate"
            label="另一操作"
            buttonRef={(ref) => {
              alternate = ref;
            }}
            onFocus={() => alternateFocused.set(true)}
            onBlur={() => alternateFocused.set(false)}
            onPress={() => {
              intent++;
              alternatePresses.set(alternatePresses() + 1);
            }}
          />
          <Button
            testID="history-fixture-detail-flow"
            label="合成详情返回流程"
            onPress={() => detailFlow.set(true)}
          />
          <If when={detailFlow() && !active()}>
            <Button
              testID="history-fixture-detail-remove"
              label="合成详情取消当前收藏"
              onPress={() => publish([opened()], 'favorites')}
            />
            <Button
              testID="history-fixture-detail-clear"
              label="合成详情清空收藏"
              onPress={() =>
                publish(
                  items('favorites').map((item) => item.drama.series_id),
                  'favorites',
                )
              }
            />
            <Button
              testID="history-fixture-detail-return"
              label="返回片库"
              onPress={() => {
                intent++;
                active.set(true);
                alternate?.focus();
                const owned = intent;
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    if (owned === intent) detailSource?.();
                  }),
                );
              }}
            />
          </If>
          <Button
            testID="history-fixture-native-focus"
            label="合成原生焦点转移"
            onPress={() => {
              // Isolate lifecycle ownership from focusGuard's separate newer-input boundary.
              // This synthetic system handoff deliberately does not increment input intent.
              alternate?.focus();
            }}
          />
          <Button
            testID="history-fixture-active"
            label="切换页面"
            onPress={() => {
              intent++;
              active.set(!active());
            }}
          />
          <Button
            testID="history-fixture-signed-in"
            label="合成账号片库"
            onPress={() => {
              const current = snapshot();
              account.set({ owner_id: '123', owner_epoch: 'b'.repeat(32) });
              if (current) snapshot.set({ ...current, owner_id: '123' });
            }}
          />
          <Button
            testID="history-fixture-epoch"
            label="合成同账号新会话"
            onPress={() => {
              setTimeout(() => account.set({ ...account(), owner_epoch: 'c'.repeat(32) }), 500);
            }}
          />
          <Button
            testID="history-fixture-owner"
            label="切换 owner"
            onPress={() => {
              const current = snapshot();
              if (current)
                snapshot.set({ ...current, owner_id: current.owner_id ? '' : 'foreign' });
            }}
          />
          <Button
            testID="history-fixture-unloaded"
            label="未加载"
            onPress={() => snapshot.set(undefined)}
          />
          <Button
            testID="history-fixture-drop-first"
            label="合成快照移除首条"
            onPress={() => publish([first])}
          />
          <Button
            testID="history-fixture-restore-first"
            label="合成新观看恢复首条"
            onPress={() => {
              const current = snapshot();
              if (current && !current.entries.some((entry) => entry.drama.series_id === first))
                snapshot.set({ ...current, entries: [initial.entries[0], ...current.entries] });
            }}
          />
          <Button
            testID="history-fixture-duplicate-first"
            label="合成重复首条"
            onPress={() => {
              const current = snapshot();
              if (current)
                snapshot.set({ ...current, entries: [current.entries[0], ...current.entries] });
            }}
          />
        </View>
        <Text>{`synthetic · mode:${mode()} · active:${active()} · count:${entries().length} · opened:${opened()}`}</Text>
        <Text testID="history-fixture-calls">{`calls:${calls().join('|')}`}</Text>
        <Text>{`alternate:${alternatePresses()}`}</Text>
        <Text>{`alternate-focused:${alternateFocused()}`}</Text>
        <View class="flex-1" style={{ display: detailFlow() && !active() ? 'none' : 'flex' }}>
          <History store={ports} />
        </View>
      </View>
    </>
  );
}
