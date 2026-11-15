import { batch, cleanup, effect, signal, untracked, type ResourceState } from 'nsh';
import {
  CoreError,
  createLibraryWriter,
  LibraryWriteError,
  type captureRequest,
  type HistoryChange,
  type Library,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

type Checkpoint = {
  change: Extract<HistoryChange, { action: 'progress' }>;
  sequence: number;
};

/** A confirmed scope belongs to the app, independently of its page or dialog. */
export interface HistoryOperation {
  readonly id: number;
  readonly ownerId: string;
  readonly kind: 'remove' | 'clear';
  readonly ids: readonly string[];
  readonly completedIds: readonly string[];
  readonly remainingIds: readonly string[];
  readonly status: 'pending' | 'partial' | 'unresolved' | 'complete';
  readonly error: string;
}

// One application owns library writes in each engine VM; a remount supersedes its old queue.
let currentOwner: object | undefined;

/** One committed snapshot and write order for home, history and resume. */
export function createLibraryState(request: ReturnType<typeof captureRequest>) {
  const lifetime = {};
  currentOwner = lifetime;
  const data = signal<Library | undefined>(undefined);
  const state = signal<ResourceState>('unresolved');
  const loading = signal(false);
  const error = signal<unknown>(undefined);
  const warning = signal('');
  const failedProgress = new Map<string, Checkpoint>();
  const removedThrough = new Map<string, number>();
  const clearedThrough = new Map<string, number>();
  const operation = signal<HistoryOperation | undefined>(undefined);
  let revision = 0;
  let sequence = 0;
  let disposed = false;
  let sealed = false;
  let draining = false;
  let abort: AbortController | undefined;
  let writes = Promise.resolve();
  const mayDispatch = () =>
    currentOwner === lifetime && (!disposed || draining) && (!sealed || draining);
  const writer = createLibraryWriter(request, mayDispatch);
  let pendingDispatch: { change: HistoryChange; ownerId: string; sequence: number } | undefined;
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
      currentOwner === lifetime &&
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
    if (disposed || sealed || currentOwner !== lifetime)
      throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    const expectedOwner = owner();
    if ((change.owner_id ?? '') !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    revision++;
    cancelRead();
    return expectedOwner;
  };
  const publish = (next: Library, expectedOwner: string) => {
    if ((next.owner_id ?? '') !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    if (!disposed && currentOwner === lifetime)
      batch(() => {
        data.set(next);
        error.set(undefined);
        state.set('ready');
      });
  };
  const send = async (change: HistoryChange, expectedOwner: string, mutation: number) => {
    // Queue admission is not permission to write to a later library owner.
    if (!mayDispatch()) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    if (owner() !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    if (pendingDispatch) throw unresolved();
    pendingDispatch = { change, ownerId: expectedOwner, sequence: mutation };
    try {
      const result = await writer.write(change);
      pendingDispatch = undefined;
      publish(result.library, expectedOwner);
    } catch (cause) {
      if (cause instanceof LibraryWriteError && cause.status === 'failed')
        pendingDispatch = undefined;
      throw cause;
    }
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
  const keyFor = (change: Checkpoint['change']) =>
    `${change.owner_id ?? ''}:${change.drama.series_id}`;
  const superseded = (checkpoint: Checkpoint) =>
    checkpoint.sequence <=
    Math.max(
      removedThrough.get(keyFor(checkpoint.change)) ?? 0,
      clearedThrough.get(checkpoint.change.owner_id ?? '') ?? 0,
    );
  const blocked = (change: Checkpoint['change']) => {
    const job = operation();
    return (
      job?.status === 'unresolved' &&
      job.ownerId === (change.owner_id ?? '') &&
      (job.kind === 'clear' || job.remainingIds.includes(change.drama.series_id))
    );
  };
  const unresolved = () =>
    new CoreError('删除结果尚未确认，请先重试该操作。', 'LIBRARY_OPERATION_UNRESOLVED', 409);
  const clearWarning = () => {
    if (!failedProgress.size) warning.set('');
  };
  const reconcile = async () => {
    if (!mayDispatch()) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    const pending = pendingDispatch;
    if (!pending) return;
    if (owner() !== pending.ownerId)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    try {
      const result = await writer.resolve();
      if (!result) throw unresolved();
      pendingDispatch = undefined;
      publish(result.library, pending.ownerId);
      if (pending.change.action === 'progress') {
        const key = keyFor(pending.change);
        if ((failedProgress.get(key)?.sequence ?? 0) <= pending.sequence)
          failedProgress.delete(key);
        clearWarning();
      }
      return pending;
    } catch (cause) {
      if (cause instanceof LibraryWriteError && cause.status === 'failed')
        pendingDispatch = undefined;
      throw cause;
    }
  };
  const supersede = (job: HistoryOperation, mutation: number, seriesId?: string) => {
    if (seriesId) removedThrough.set(`${job.ownerId}:${seriesId}`, mutation);
    else clearedThrough.set(job.ownerId, mutation);
    for (const [key, checkpoint] of failedProgress)
      if (superseded(checkpoint)) failedProgress.delete(key);
    clearWarning();
  };
  const runOperation = async (job: HistoryOperation, retry = false, mutation = job.id) => {
    const completedIds = [...job.completedIds];
    const remainingIds = [...job.remainingIds];
    try {
      let recovered: typeof pendingDispatch;
      if (retry && pendingDispatch) {
        const earlier = pendingDispatch.change.action === 'progress';
        try {
          recovered = await reconcile();
        } catch (cause) {
          // An earlier progress failure is terminal; the confirmed removal can now follow it.
          if (!earlier || !(cause instanceof LibraryWriteError) || cause.status !== 'failed')
            throw cause;
        }
      }
      if (job.kind === 'clear') {
        if (recovered?.change.action !== 'clear')
          await send(
            { action: 'clear', kind: 'history', owner_id: job.ownerId },
            job.ownerId,
            mutation,
          );
        supersede(job, recovered?.change.action === 'clear' ? recovered.sequence : mutation);
        completedIds.push(...remainingIds.splice(0));
      } else {
        while (remainingIds.length) {
          const seriesId = remainingIds[0]!;
          const recoveredRemoval =
            recovered?.change.action === 'remove' && recovered.change.series_id === seriesId;
          if (!recoveredRemoval)
            await send(
              { action: 'remove', kind: 'history', owner_id: job.ownerId, series_id: seriesId },
              job.ownerId,
              mutation,
            );
          supersede(job, recoveredRemoval ? recovered!.sequence : mutation, seriesId);
          recovered = undefined;
          completedIds.push(remainingIds.shift()!);
          operation.set({
            ...job,
            completedIds: [...completedIds],
            remainingIds: [...remainingIds],
          });
        }
      }
      operation.set({ ...job, completedIds, remainingIds, status: 'complete', error: '' });
    } catch (cause) {
      // Until the original dispatch is known terminal, neither GET nor another write proves rollback.
      operation.set({
        ...job,
        completedIds,
        remainingIds,
        status: pendingDispatch ? 'unresolved' : 'partial',
        error: errorMessage(cause, '删除结果未确认'),
      });
    }
  };
  const startOperation = (kind: HistoryOperation['kind'], selected: readonly string[] = []) => {
    const current = operation();
    if (current && current.status !== 'complete') return Promise.resolve();
    const expectedOwner = owner();
    const wanted = new Set(selected);
    const ids = (data()!.entries ?? [])
      .filter((entry) => entry.last_played_at)
      .slice()
      .sort((a, b) => b.last_played_at! - a.last_played_at!)
      .map((entry) => entry.drama.series_id)
      .filter(
        (id, index, values) => values.indexOf(id) === index && (kind === 'clear' || wanted.has(id)),
      );
    if (kind === 'remove' && !ids.length) return Promise.resolve();
    admit({ action: 'clear', kind: 'history', owner_id: expectedOwner });
    const job: HistoryOperation = {
      id: ++sequence,
      ownerId: expectedOwner,
      kind,
      ids,
      completedIds: [],
      remainingIds: ids,
      status: 'pending',
      error: '',
    };
    operation.set(job);
    return enqueue(() => runOperation(job));
  };
  effect(() => untracked(() => void read()));
  cleanup(() => {
    disposed = true;
    cancelRead();
  });
  return {
    library: Object.assign(() => data(), { state, loading, error, refetch: read }),
    warning,
    beginShutdown(checkpoint: () => void) {
      if (sealed || currentOwner !== lifetime) return () => {};
      draining = true;
      try {
        checkpoint();
      } catch (cause) {
        draining = false;
        throw cause;
      } finally {
        sealed = true;
      }
      return () => {
        draining = false;
      };
    },
    management: {
      operation: () => operation(),
      remove: (ids: readonly string[]) => startOperation('remove', ids),
      clear: () => startOperation('clear'),
      retry(id: number) {
        const current = operation();
        if (!current || current.id !== id || !['partial', 'unresolved'].includes(current.status))
          return Promise.resolve();
        admit({ action: 'clear', kind: 'history', owner_id: current.ownerId });
        const job = { ...current, status: 'pending' as const, error: '' };
        operation.set(job);
        const mutation = ++sequence;
        return enqueue(() => runOperation(job, true, mutation));
      },
    },
    save(change: Extract<HistoryChange, { action: 'progress' }>) {
      const checkpoint: Checkpoint = { change, sequence: ++sequence };
      const key = keyFor(change);
      const failed = (cause: unknown) => {
        if (superseded(checkpoint)) return;
        const existing = failedProgress.get(key);
        if (!existing || existing.sequence < checkpoint.sequence)
          failedProgress.set(key, checkpoint);
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
          if (blocked(change)) throw unresolved();
          await send(change, expectedOwner, checkpoint.sequence);
          if ((failedProgress.get(key)?.sequence ?? 0) <= checkpoint.sequence)
            failedProgress.delete(key);
          clearWarning();
        } catch (cause) {
          failed(cause);
        }
      });
    },
    retryFailed() {
      if (disposed || sealed || currentOwner !== lifetime)
        throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
      const pending = Array.from(failedProgress);
      if (!pending.length) return Promise.resolve();
      revision++;
      cancelRead();
      return enqueue(async () => {
        if (pendingDispatch) {
          if (pendingDispatch.change.action !== 'progress') throw unresolved();
          try {
            await reconcile();
          } catch (cause) {
            if (!(cause instanceof LibraryWriteError) || cause.status !== 'failed') throw cause;
          }
        }
        for (const [key, checkpoint] of pending) {
          if (failedProgress.get(key) !== checkpoint || superseded(checkpoint)) continue;
          const { change } = checkpoint;
          if (blocked(change)) throw unresolved();
          const expectedOwner = owner();
          if ((change.owner_id ?? '') !== expectedOwner)
            throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
          await send(change, expectedOwner, checkpoint.sequence);
          if (failedProgress.get(key) === checkpoint) failedProgress.delete(key);
        }
        clearWarning();
      });
    },
    assertSaved() {
      if (pendingDispatch || operation()?.status === 'unresolved') throw unresolved();
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
