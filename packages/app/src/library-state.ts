import { batch, cleanup, effect, signal, untracked, type ResourceState } from 'nsh';
import {
  CoreError,
  createLibraryWriter,
  LibraryWriteError,
  type captureRequest,
  validLibrarySnapshot,
  type Account,
  type LibraryChange,
  type LibraryKind,
  type Library,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';
import { reportFailure } from './diagnostics';

type OwnerScope = { ownerId: string; epoch: number; ownerEpoch?: string };
type ManagedOperation = HistoryOperation & { category: LibraryKind; scope: OwnerScope };

/** A favorite always retains its exact desired membership, including during recovery. */
export interface FavoriteOperation {
  readonly id: number;
  readonly ownerId: string;
  readonly ownerEpoch?: string;
  readonly seriesId: string;
  readonly value: boolean;
  readonly status: 'pending' | 'failed' | 'unresolved' | 'complete';
  readonly error: string;
}

type Checkpoint = {
  change: Extract<LibraryChange, { action: 'progress' }>;
  sequence: number;
  scope?: OwnerScope;
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

const validOwner = (value: unknown): value is string =>
  value === '' || (typeof value === 'string' && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value));

// One application owns library writes in each engine VM; a remount supersedes its old queue.
let currentOwner: object | undefined;

/** One committed snapshot and write order for home, history and resume. */
export function createLibraryState(
  request: ReturnType<typeof captureRequest>,
  accountScope?: () => Pick<Account, 'owner_id' | 'owner_epoch'> | undefined,
) {
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
  const operation = signal<ManagedOperation | undefined>(undefined);
  const favoriteOperation = signal<FavoriteOperation | undefined>(undefined);
  let favoriteIntent:
    | { change: Extract<LibraryChange, { action: 'favorite' }>; scope: OwnerScope }
    | undefined;
  let epoch = 0;
  let active = true;
  let refreshNeeded = false;
  let revision = 0;
  let sequence = 0;
  let disposed = false;
  let sealed = false;
  let draining = false;
  let ownerBlocked = false;
  let transitionRunning = false;
  let abort: AbortController | undefined;
  let readDispatched = false;
  let writes = Promise.resolve();
  const mayDispatch = () =>
    currentOwner === lifetime && (!disposed || draining) && (!sealed || draining);
  const writer = createLibraryWriter(request, () => {
    if (!mayDispatch()) return false;
    if (pendingDispatch) checkScope(pendingDispatch.scope);
    return true;
  });
  let pendingDispatch: { change: LibraryChange; scope: OwnerScope; sequence: number } | undefined;
  const owner = () => {
    const current = data();
    if (!current)
      throw new CoreError('观看记录尚未读取成功，请先重试加载。', 'LIBRARY_NOT_READY', 409);
    if (!validOwner(current.owner_id ?? ''))
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    return current.owner_id ?? '';
  };
  const captureScope = (ownerId = owner()): OwnerScope => ({
    ownerId,
    epoch,
    ownerEpoch: accountScope?.()?.owner_epoch,
  });
  const checkScope = (scope: OwnerScope) => {
    const current = accountScope?.();
    if (
      scope.epoch !== epoch ||
      owner() !== scope.ownerId ||
      (scope.ownerEpoch !== undefined && current?.owner_epoch !== scope.ownerEpoch) ||
      (current && (current.owner_id ?? '') !== scope.ownerId)
    )
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
  };
  const cancelRead = () => {
    abort?.abort();
    abort = undefined;
    readDispatched = false;
    batch(() => {
      loading.set(false);
      state.set(error() ? 'errored' : data() ? 'ready' : 'unresolved');
    });
  };
  const read = async (
    fetch: (abort: AbortSignal) => Promise<Library> = (abort) =>
      request<Library>('/api/v1/library', abort),
    onPublish?: () => void,
    shouldRun: () => boolean = () => true,
    propagateFailure = false,
  ) => {
    if (disposed || sealed || ownerBlocked || !shouldRun()) return;
    if (!active) {
      refreshNeeded = true;
      return;
    }
    refreshNeeded = false;
    cancelRead();
    // Capture all tokens before waiting: a later queued mutation invalidates this read.
    const owned = revision;
    const ownedEpoch = epoch;
    const coreEpoch = accountScope?.()?.owner_epoch;
    const expectedOwner = data() ? (data()!.owner_id ?? '') : undefined;
    const tail = writes;
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      !disposed &&
      active &&
      shouldRun() &&
      currentOwner === lifetime &&
      !controller.signal.aborted &&
      owned === revision &&
      ownedEpoch === epoch &&
      (coreEpoch === undefined || coreEpoch === accountScope?.()?.owner_epoch) &&
      expectedOwner === (data() ? (data()!.owner_id ?? '') : undefined);
    batch(() => {
      loading.set(true);
      state.set(data() ? 'refreshing' : 'pending');
    });
    try {
      await tail;
      if (!owns()) return;
      if (pendingDispatch) {
        refreshNeeded = true;
        state.set(error() ? 'errored' : data() ? 'ready' : 'unresolved');
        return;
      }
      readDispatched = true;
      const next = await fetch(controller.signal);
      if (
        !validLibrarySnapshot(next) ||
        !validOwner(next.owner_id ?? '') ||
        (expectedOwner !== undefined && (next.owner_id ?? '') !== (expectedOwner ?? ''))
      )
        throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
      if (owns())
        batch(() => {
          data.set(next);
          error.set(undefined);
          state.set('ready');
          onPublish?.();
        });
    } catch (cause) {
      if (owns()) {
        batch(() => {
          error.set(cause);
          state.set('errored');
        });
        if (propagateFailure) throw cause;
      }
    } finally {
      if (abort === controller) {
        abort = undefined;
        readDispatched = false;
        loading.set(false);
        if (!owns()) state.set(error() ? 'errored' : data() ? 'ready' : 'unresolved');
      }
    }
  };
  const admit = (change: LibraryChange) => {
    if (disposed || sealed || currentOwner !== lifetime)
      throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    if (ownerBlocked)
      throw new CoreError(
        '正在确认账号状态，暂不能写入观看记录。',
        'LIBRARY_OWNER_TRANSITION',
        409,
      );
    const expectedOwner = owner();
    if ((change.owner_id ?? '') !== expectedOwner)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    revision++;
    if (abort && readDispatched) refreshNeeded = true;
    cancelRead();
    const scope = captureScope(expectedOwner);
    checkScope(scope);
    return scope;
  };
  const publish = (next: Library, scope: OwnerScope) => {
    checkScope(scope);
    if (!validLibrarySnapshot(next) || (next.owner_id ?? '') !== scope.ownerId)
      throw new CoreError('记录所属账号已变化，请重新加载。', 'LIBRARY_OWNER_CHANGED', 409);
    if (!disposed && currentOwner === lifetime)
      batch(() => {
        data.set(next);
        error.set(undefined);
        state.set('ready');
      });
  };
  const send = async (change: LibraryChange, scope: OwnerScope, mutation: number) => {
    // Queue admission is not permission to write to a later library owner.
    if (!mayDispatch()) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    checkScope(scope);
    if (pendingDispatch) throw unresolved();
    pendingDispatch = { change, scope, sequence: mutation };
    try {
      const result = await writer.write(change);
      pendingDispatch = undefined;
      publish(result.library, scope);
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
    void writes.then(() => {
      if (refreshNeeded && !pendingDispatch && !ownerBlocked) void read();
    });
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
      job?.category === 'history' &&
      job.status === 'unresolved' &&
      job.ownerId === (change.owner_id ?? '') &&
      (job.kind === 'clear' || job.remainingIds.includes(change.drama.series_id))
    );
  };
  const unresolved = () =>
    new CoreError('片库操作结果尚未确认，请先重试该操作。', 'LIBRARY_OPERATION_UNRESOLVED', 409);
  const clearWarning = () => {
    if (!failedProgress.size) warning.set('');
  };
  const reconcile = async () => {
    if (!mayDispatch()) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
    const pending = pendingDispatch;
    if (!pending) return;
    checkScope(pending.scope);
    try {
      const result = await writer.resolve();
      if (!result) throw unresolved();
      pendingDispatch = undefined;
      publish(result.library, pending.scope);
      if (pending.change.action === 'favorite' && favoriteOperation()?.id === pending.sequence)
        favoriteOperation.set({ ...favoriteOperation()!, status: 'complete', error: '' });
      if (pending.change.action === 'progress') {
        const key = keyFor(pending.change);
        if ((failedProgress.get(key)?.sequence ?? 0) <= pending.sequence)
          failedProgress.delete(key);
        clearWarning();
      }
      return pending;
    } catch (cause) {
      if (cause instanceof LibraryWriteError && cause.status === 'failed') {
        pendingDispatch = undefined;
        if (pending.change.action === 'favorite' && favoriteOperation()?.id === pending.sequence)
          favoriteOperation.set({
            ...favoriteOperation()!,
            status: 'failed',
            error: errorMessage(cause, '收藏未保存'),
          });
      }
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
  const runOperation = async (job: ManagedOperation, retry = false, mutation = job.id) => {
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
        if (!(recovered?.change.action === 'clear' && recovered.change.kind === job.category))
          await send(
            { action: 'clear', kind: job.category, owner_id: job.ownerId },
            job.scope,
            mutation,
          );
        if (job.category === 'history')
          supersede(job, recovered?.change.action === 'clear' ? recovered.sequence : mutation);
        completedIds.push(...remainingIds.splice(0));
      } else {
        while (remainingIds.length) {
          const seriesId = remainingIds[0]!;
          const recoveredRemoval =
            recovered?.change.action === 'remove' &&
            recovered.change.kind === job.category &&
            recovered.change.series_id === seriesId;
          if (!recoveredRemoval)
            await send(
              { action: 'remove', kind: job.category, owner_id: job.ownerId, series_id: seriesId },
              job.scope,
              mutation,
            );
          if (job.category === 'history')
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
  const startOperation = (
    category: LibraryKind,
    kind: HistoryOperation['kind'],
    selected: readonly string[] = [],
  ) => {
    const current = operation();
    if (current && current.status !== 'complete') return Promise.resolve();
    const expectedOwner = owner();
    const wanted = new Set(selected);
    const ids = (
      category === 'history'
        ? data()!
            .entries.filter((entry) => entry.last_played_at)
            .slice()
            .sort((a, b) => b.last_played_at! - a.last_played_at!)
        : data()!.favorites
    )
      .map((entry) => entry.drama.series_id)
      .filter(
        (id, index, values) => values.indexOf(id) === index && (kind === 'clear' || wanted.has(id)),
      );
    if (kind === 'remove' && !ids.length) return Promise.resolve();
    const scope = admit({ action: 'clear', kind: category, owner_id: expectedOwner });
    const job: ManagedOperation = {
      category,
      scope,
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
  const retryOperation = (category: LibraryKind, id: number) => {
    const current = operation();
    if (
      !current ||
      current.category !== category ||
      current.id !== id ||
      !['partial', 'unresolved'].includes(current.status)
    )
      return Promise.resolve();
    checkScope(current.scope);
    const scope = admit({ action: 'clear', kind: category, owner_id: current.ownerId });
    const job = { ...current, scope, status: 'pending' as const, error: '' };
    operation.set(job);
    const mutation = ++sequence;
    return enqueue(() => runOperation(job, true, mutation));
  };
  const runFavorite = async (
    job: FavoriteOperation,
    intent: NonNullable<typeof favoriteIntent>,
    retry = false,
  ) => {
    try {
      checkScope(intent.scope);
      let recovered: typeof pendingDispatch;
      if (retry && pendingDispatch) {
        const original = pendingDispatch.sequence === job.id;
        try {
          recovered = await reconcile();
        } catch (cause) {
          if (original || !(cause instanceof LibraryWriteError) || cause.status !== 'failed')
            throw cause;
        }
      }
      if (recovered?.sequence !== job.id) await send(intent.change, intent.scope, job.id);
      if (favoriteOperation()?.id === job.id)
        favoriteOperation.set({ ...job, status: 'complete', error: '' });
    } catch (cause) {
      if (favoriteOperation()?.id === job.id)
        favoriteOperation.set({
          ...job,
          status: pendingDispatch ? 'unresolved' : 'failed',
          error: errorMessage(cause, '收藏未保存'),
        });
    }
  };
  const retryFavorite = (id: number, recovery = false): Promise<void> => {
    const current = favoriteOperation();
    const intent = favoriteIntent;
    if (
      !current ||
      current.id !== id ||
      !intent ||
      !['failed', 'unresolved'].includes(current.status)
    )
      return Promise.resolve();
    checkScope(intent.scope);
    if (recovery) {
      revision++;
      cancelRead();
    } else admit(intent.change);
    const job = { ...current, status: 'pending' as const, error: '' };
    favoriteOperation.set(job);
    return enqueue(() => runFavorite(job, intent, true));
  };
  effect(() => untracked(() => void read()));
  cleanup(() => {
    disposed = true;
    cancelRead();
  });
  const api = {
    library: Object.assign(() => data(), { state, loading, error, refetch: () => read() }),
    warning,
    /** Observe the current owner without resetting writer identity or management recovery. */
    observe(
      fetch: (abort: AbortSignal) => Promise<Library>,
      onPublish: () => void,
      shouldRun: () => boolean,
    ) {
      return read(fetch, onPublish, shouldRun, true);
    },
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
        refreshNeeded = false;
        cancelRead();
      }
      return () => {
        draining = false;
      };
    },
    /** Seal admission synchronously; a failed owner command stays sealed until authoritative recovery. */
    async transitionOwner(work: () => Promise<Library>, publishAccount?: () => void) {
      if (disposed || sealed || currentOwner !== lifetime)
        throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
      if (transitionRunning)
        throw new CoreError('账号切换尚未完成。', 'LIBRARY_OWNER_TRANSITION', 409);
      const wasBlocked = ownerBlocked;
      ownerBlocked = true;
      transitionRunning = true;
      revision++;
      cancelRead();
      let dispatched = false;
      try {
        await api.drain();
        await api.retryFailed();
        api.assertSaved();
        dispatched = true;
        const next = await work();
        if (!validLibrarySnapshot(next) || !validOwner(next.owner_id ?? ''))
          throw new CoreError(
            '账号记录响应无效，请重新确认账号状态。',
            'LIBRARY_OWNER_CHANGED',
            409,
          );
        if (!mayDispatch()) throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
        writer.reset();
        epoch++;
        revision++;
        failedProgress.clear();
        removedThrough.clear();
        clearedThrough.clear();
        pendingDispatch = undefined;
        batch(() => {
          operation.set(undefined);
          favoriteOperation.set(undefined);
          favoriteIntent = undefined;
          warning.set('');
          data.set(next);
          error.set(undefined);
          state.set('ready');
          publishAccount?.();
        });
        ownerBlocked = false;
        refreshNeeded = false;
      } catch (cause) {
        // Before work starts the core owner cannot have changed. Afterwards only recovery can unlock.
        if (!dispatched && !wasBlocked) ownerBlocked = false;
        throw cause;
      } finally {
        transitionRunning = false;
      }
    },
    ownerBlocked: () => ownerBlocked,
    management: {
      operation: (): HistoryOperation | undefined =>
        operation()?.category === 'history' ? operation() : undefined,
      remove: (ids: readonly string[]) => startOperation('history', 'remove', ids),
      clear: () => startOperation('history', 'clear'),
      retry: (id: number) => retryOperation('history', id),
    },
    favoritesManagement: {
      operation: (): HistoryOperation | undefined =>
        operation()?.category === 'favorites' ? operation() : undefined,
      remove: (ids: readonly string[]) => startOperation('favorites', 'remove', ids),
      clear: () => startOperation('favorites', 'clear'),
      retry: (id: number) => retryOperation('favorites', id),
    },
    favoriteOperation: () => favoriteOperation(),
    retryFavorite: (id: number) => retryFavorite(id),
    favorite(input: Extract<LibraryChange, { action: 'favorite' }>) {
      const current = favoriteOperation();
      if (
        (current && ['pending', 'unresolved'].includes(current.status)) ||
        operation()?.status === 'unresolved'
      )
        throw unresolved();
      const change = JSON.parse(JSON.stringify(input)) as typeof input;
      const scope = admit(change);
      const job: FavoriteOperation = {
        id: ++sequence,
        ownerId: scope.ownerId,
        ownerEpoch: scope.ownerEpoch,
        seriesId: change.drama.series_id,
        value: change.value,
        status: 'pending',
        error: '',
      };
      const intent = { change, scope };
      favoriteIntent = intent;
      favoriteOperation.set(job);
      return enqueue(() => runFavorite(job, intent));
    },
    /** Backgrounding cancels observation, never already accepted writes. */
    setActive(next: boolean) {
      if (active === next) return;
      active = next;
      if (!next) {
        refreshNeeded = true;
        cancelRead();
      } else if (refreshNeeded) void read();
    },
    save(change: Extract<LibraryChange, { action: 'progress' }>) {
      const checkpoint: Checkpoint = { change, sequence: ++sequence };
      const key = keyFor(change);
      const failed = (cause: unknown) => {
        if (superseded(checkpoint)) return;
        const existing = failedProgress.get(key);
        if (!existing || existing.sequence < checkpoint.sequence)
          failedProgress.set(key, checkpoint);
        console.warn('观看进度写入失败', cause);
        reportFailure('storage', '保存观看进度', cause);
        warning.set(errorMessage(cause, '观看进度未保存'));
      };
      let scope: OwnerScope;
      try {
        scope = admit(change);
        checkpoint.scope = scope;
      } catch (cause) {
        // Before the first read, retain progress for explicit recovery. Foreign/transition
        // rejections never join a different owner's retry queue.
        if (cause instanceof CoreError && cause.code === 'LIBRARY_NOT_READY') failed(cause);
        else warning.set(errorMessage(cause, '观看进度未保存'));
        return Promise.resolve();
      }
      return enqueue(async () => {
        try {
          if (blocked(change)) throw unresolved();
          await send(change, scope, checkpoint.sequence);
          if ((failedProgress.get(key)?.sequence ?? 0) <= checkpoint.sequence)
            failedProgress.delete(key);
          clearWarning();
        } catch (cause) {
          failed(cause);
        }
      });
    },
    retryFailed(): Promise<void> {
      if (disposed || sealed || currentOwner !== lifetime)
        throw new CoreError('观看记录已关闭。', 'LIBRARY_DISPOSED', 410);
      const favorite = favoriteOperation();
      if (favorite && ['failed', 'unresolved'].includes(favorite.status))
        return retryFavorite(favorite.id, true).then(() => {
          if (favoriteOperation()?.status !== 'complete') {
            if (pendingDispatch) throw unresolved();
            throw new CoreError('收藏仍未保存，请重试。', 'LIBRARY_FAVORITE_UNSAVED', 409);
          }
          return api.retryFailed();
        });
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
          await send(change, checkpoint.scope ?? captureScope(expectedOwner), checkpoint.sequence);
          if (failedProgress.get(key) === checkpoint) failedProgress.delete(key);
        }
        clearWarning();
      });
    },
    assertSaved() {
      if (pendingDispatch || operation()?.status === 'unresolved') throw unresolved();
      if (favoriteOperation()?.status === 'failed')
        throw new CoreError('收藏仍未保存，请重试。', 'LIBRARY_FAVORITE_UNSAVED', 409);
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
  return api;
}
