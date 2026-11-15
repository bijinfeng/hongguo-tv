import { Text, View, signal, type ViewRef } from 'nsh';
import { Button, Product, type ProductTarget } from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import { History } from '../src/pages/History';
import type { HistoryOperation } from '../src/library-state';
import type { Store } from '../src/store';

const first = '9007199254740992';
const second = '9007199254740993';
const initial: Library = {
  owner_id: '',
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
  const job = signal<HistoryOperation | undefined>(undefined);
  const mode = signal<'success' | 'partial' | 'unresolved' | 'slow' | 'interrupt'>('success');
  const calls = signal<string[]>([]);
  const opened = signal('none');
  const alternatePresses = signal(0);
  const alternateFocused = signal(false);
  let alternate: ViewRef | undefined;
  let sequence = 0;
  let intent = 0;
  const entries = () => snapshot()?.entries ?? [];
  const publish = (ids: readonly string[]) => {
    const current = snapshot();
    if (current)
      snapshot.set({
        ...current,
        entries: current.entries.filter((entry) => !ids.includes(entry.drama.series_id)),
      });
  };
  const settle = async (current: HistoryOperation, retry = false) => {
    await new Promise<void>((resolve) => setTimeout(resolve, mode() === 'slow' ? 500 : 30));
    if (retry && current.status === 'unresolved') {
      job.set({ ...current, status: 'partial', error: '合成回执确认原删除失败' });
      return;
    }
    const ids = current.remainingIds;
    if (!retry && mode() === 'partial') {
      const completed = ids.slice(0, 1);
      publish(completed);
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
      publish(ids);
      job.set({
        ...current,
        completedIds: current.ids,
        remainingIds: [],
        status: 'complete',
        error: '',
      });
      if (mode() === 'interrupt')
        requestAnimationFrame(() => {
          intent++;
          alternate?.focus();
        });
    }
  };
  const start = (kind: 'remove' | 'clear', ids: readonly string[]) => {
    if (!snapshot() || snapshot()?.owner_id) throw new Error('合成 owner 不可管理');
    const current = job();
    if (current && current.status !== 'complete') return Promise.resolve();
    const exact = entries()
      .map((entry) => entry.drama.series_id)
      .filter((id) => ids.includes(id));
    calls.update((items) => [...items, `${kind}:${exact.join(',')}`]);
    const next: HistoryOperation = {
      id: ++sequence,
      ownerId: '',
      kind,
      ids: exact,
      completedIds: [],
      remainingIds: exact,
      status: 'pending',
      error: '',
    };
    job.set(next);
    return settle(next);
  };
  const library = Object.assign(() => snapshot(), {
    state: () => (snapshot() ? ('ready' as const) : ('loading' as const)),
    loading: () => !snapshot(),
    error: () => undefined,
    refetch: async () => {},
  });
  const ports = {
    target: props.target,
    library,
    entries,
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
    open: (drama: { series_id: string }) => opened.set(drama.series_id),
    historyManagement: {
      operation: job,
      remove: (ids: readonly string[]) => start('remove', ids),
      clear: () =>
        start(
          'clear',
          entries().map((entry) => entry.drama.series_id),
        ),
      retry: (id: number) => {
        const current = job();
        if (!current || id !== current.id) return Promise.resolve();
        calls.update((items) => [
          ...items,
          `retry:${current.status}:${current.remainingIds.join(',')}`,
        ]);
        job.set({ ...current, status: 'pending', error: '' });
        return settle(current, true);
      },
    },
  } as unknown as Store;
  return (
    <Product.Provider value={props.target}>
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
        </View>
        <Text>{`synthetic · mode:${mode()} · active:${active()} · count:${entries().length} · opened:${opened()}`}</Text>
        <Text testID="history-fixture-calls">{`calls:${calls().join('|')}`}</Text>
        <Text>{`alternate:${alternatePresses()}`}</Text>
        <Text>{`alternate-focused:${alternateFocused()}`}</Text>
        <History store={ports} />
      </View>
    </Product.Provider>
  );
}
