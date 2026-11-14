import { signal, effect, cleanup } from 'nsh';
import { captureRequest, type SearchHistory, type SearchHistoryChange } from '@hongguo/core-client';

/** One mounted installation's keyword reads and ordered committed writes. */
export function createRecentSearches(
  request: ReturnType<typeof captureRequest>,
  active: () => boolean,
) {
  const data = signal<SearchHistory | undefined>(undefined);
  const loading = signal(false);
  const saving = signal(false);
  const error = signal('');
  let revision = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  let latest: SearchHistoryChange | undefined;
  const failed = signal<SearchHistoryChange | undefined>(undefined);
  let writes = Promise.resolve();
  const cancelRead = () => {
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const load = async () => {
    cancelRead();
    const owned = revision;
    const controller = new AbortController();
    abort = controller;
    const owns = () => !disposed && owned === revision && !controller.signal.aborted;
    loading.set(true);
    try {
      await writes;
      if (!owns()) return;
      const next = await request<SearchHistory>('/api/v1/search/history', controller.signal);
      if (owns()) {
        data.set(next);
        if (!failed()) error.set('');
      }
    } catch (cause) {
      if (owns())
        error.set(`搜索记录未能加载：${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      if (owns()) loading.set(false);
    }
  };
  const change = (action: SearchHistoryChange) => {
    revision++;
    cancelRead();
    const owned = revision;
    failed.set(undefined);
    latest = action;
    error.set('');
    saving.set(true);
    writes = writes.then(async () => {
      try {
        const next = await request<SearchHistory>('/api/v1/search/history', undefined, action);
        // Serialized successful commits remain usable even if the following intent fails.
        if (!disposed) data.set(next);
        if (!disposed && owned === revision) error.set('');
      } catch (cause) {
        if (!disposed && owned === revision) {
          failed.set(action);
          error.set(
            `${action.action === 'clear' ? '搜索记录未清空' : '搜索记录未保存'}：${cause instanceof Error ? cause.message : String(cause)}`,
          );
        }
      } finally {
        if (!disposed && owned === revision) saving.set(false);
      }
    });
    return writes;
  };
  effect(() => {
    if (active()) void load();
    else cancelRead();
  });
  cleanup(() => {
    disposed = true;
    cancelRead();
  });
  return {
    items: () => data()?.items ?? [],
    ready: () => data() !== undefined,
    loading,
    saving,
    clearing: () => saving() && latest?.action === 'clear',
    error,
    add: (query: string) => change({ action: 'add', query }),
    clear: () => change({ action: 'clear' }),
    retryLabel: () =>
      failed()?.action === 'clear' ? '重试清空' : failed() ? '重试保存' : '重试加载',
    retry: () => (failed() ? change(failed()!) : load()),
    drain: () => writes,
  };
}
