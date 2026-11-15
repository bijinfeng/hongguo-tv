import { batch, cleanup, effect, signal, untracked, type ResourceState } from 'nsh';
import {
  CoreError,
  type captureRequest,
  type HistoryChange,
  type Library,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

/** One committed snapshot and write order for home, history and resume. */
export function createLibraryState(request: ReturnType<typeof captureRequest>) {
  const data = signal<Library | undefined>(undefined);
  const state = signal<ResourceState>('unresolved');
  const loading = signal(false);
  const error = signal<unknown>(undefined);
  const warning = signal('');
  const failedProgress = new Map<string, HistoryChange>();
  let revision = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  let writes = Promise.resolve();
  const owner = () => {
    const current = data();
    if (!current)
      throw new CoreError('观看记录尚未读取成功，请先重试加载。', 'LIBRARY_NOT_READY', 409);
    if (current.owner_id)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    return current.owner_id ?? '';
  };
  const cancelRead = () => {
    abort?.abort();
    abort = undefined;
    batch(() => {
      loading.set(false);
      state.set(error() ? 'errored' : data() ? 'ready' : 'unresolved');
    });
  };
  const read = async () => {
    if (disposed) return;
    cancelRead();
    // Capture all tokens before waiting: a later queued mutation invalidates this read.
    const owned = revision;
    const expectedOwner = data()?.owner_id;
    const tail = writes;
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      !disposed &&
      !controller.signal.aborted &&
      owned === revision &&
      expectedOwner === data()?.owner_id;
    batch(() => {
      loading.set(true);
      state.set(data() ? 'refreshing' : 'pending');
    });
    try {
      await tail;
      if (!owns()) return;
      const next = await request<Library>('/api/v1/library', controller.signal);
      if (owns())
        batch(() => {
          data.set(next);
          error.set(undefined);
          state.set('ready');
        });
    } catch (cause) {
      if (owns())
        batch(() => {
          error.set(cause);
          state.set('errored');
        });
    } finally {
      if (abort === controller) {
        abort = undefined;
        loading.set(false);
      }
    }
  };
  const admit = (change: HistoryChange) => {
    if (disposed) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    const expectedOwner = owner();
    if ((change.owner_id ?? '') !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    revision++;
    cancelRead();
    return expectedOwner;
  };
  const send = async (change: HistoryChange, expectedOwner: string) => {
    // Queue admission is not permission to write to a later library owner.
    if (owner() !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    const next = await request<Library>('/api/v1/library', undefined, change);
    if ((next.owner_id ?? '') !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    if (!disposed)
      batch(() => {
        data.set(next);
        error.set(undefined);
        state.set('ready');
      });
    return next;
  };
  const enqueue = <T>(work: () => Promise<T>) => {
    const operation = writes.then(work);
    // A failed operation remains rejected to its caller without poisoning subsequent work.
    writes = operation.then(
      () => {},
      () => {},
    );
    return operation;
  };
  effect(() => untracked(() => void read()));
  cleanup(() => {
    disposed = true;
    cancelRead();
  });
  return {
    library: Object.assign(() => data(), { state, loading, error, refetch: read }),
    warning,
    save(change: Extract<HistoryChange, { action: 'progress' }>) {
      const key = `${change.owner_id ?? ''}:${change.drama.series_id}`;
      const failed = (cause: unknown) => {
        failedProgress.set(key, change);
        console.warn('观看进度写入失败', cause);
        warning.set(errorMessage(cause, '观看进度未保存'));
      };
      let expectedOwner: string;
      try {
        expectedOwner = admit(change);
      } catch (cause) {
        failed(cause);
        return Promise.resolve();
      }
      return enqueue(async () => {
        try {
          await send(change, expectedOwner);
          failedProgress.delete(key);
          if (!failedProgress.size) warning.set('');
        } catch (cause) {
          failed(cause);
        }
      });
    },
    retryFailed() {
      const pending = Array.from(failedProgress);
      if (!pending.length) return Promise.resolve();
      revision++;
      cancelRead();
      return enqueue(async () => {
        for (const [key, change] of pending) {
          if (failedProgress.get(key) !== change) continue;
          const expectedOwner = owner();
          if ((change.owner_id ?? '') !== expectedOwner)
            throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
          await send(change, expectedOwner);
          if (failedProgress.get(key) === change) failedProgress.delete(key);
        }
        if (!failedProgress.size) warning.set('');
      });
    },
    assertSaved() {
      if (failedProgress.size)
        throw new CoreError('观看进度仍未保存，请重试。', 'LIBRARY_PROGRESS_UNSAVED', 409);
    },
    async drain() {
      // Include new work admitted while waiting; callers must never drain from inside a job.
      for (;;) {
        const tail = writes;
        await tail;
        if (tail === writes) return;
      }
    },
  };
}
