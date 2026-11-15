import type { LibraryChange, Library, LibraryOperationIdentity } from '@hongguo/contracts';

/** The same captured request port serves HTTP and native sessions. */
export type LibraryWriteRequest = <T>(
  path: string,
  abort?: AbortSignal,
  body?: unknown,
) => Promise<T>;

export interface LibraryWriteResult extends LibraryOperationIdentity {
  change: LibraryChange;
  library: Library;
}

/** Only `failed` proves that the exact original operation has finished. */
export class LibraryWriteError extends Error {
  readonly status: 'failed' | 'unresolved';
  readonly code: string;
  readonly change: LibraryChange;
  readonly session_id?: string;
  readonly operation_id: string;

  constructor(
    status: LibraryWriteError['status'],
    code: string,
    message: string,
    change: LibraryChange,
    operation_id: string,
    session_id?: string,
  ) {
    super(message);
    this.name = 'LibraryWriteError';
    this.status = status;
    this.code = code;
    this.change = change;
    this.operation_id = operation_id;
    this.session_id = session_id;
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const decimalId = (value: unknown) =>
  typeof value === 'string' && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value);
const optionalNumber = (value: unknown, maximum = Infinity, integer = false) =>
  value === undefined ||
  (typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= maximum &&
    (!integer || Number.isSafeInteger(value)));

/** History and favorites publish the same compact card, never episode payloads. */
function validDrama(value: unknown) {
  return (
    record(value) &&
    decimalId(value.series_id) &&
    typeof value.title === 'string' &&
    typeof value.cover === 'string' &&
    typeof value.intro === 'string' &&
    (value.cover_fallback === undefined || typeof value.cover_fallback === 'string') &&
    (value.content_type === undefined || typeof value.content_type === 'string') &&
    optionalNumber(value.episode_count, 10000, true) &&
    value.episodes === undefined &&
    (value.tags === undefined ||
      (Array.isArray(value.tags) && value.tags.every((tag: unknown) => typeof tag === 'string')))
  );
}

/** Validate the publishable snapshot as well as the receipt's operation identity. */
export function validLibrarySnapshot(value: unknown): value is Library {
  return (
    record(value) &&
    (value.owner_id === undefined || value.owner_id === '' || decimalId(value.owner_id)) &&
    Array.isArray(value.entries) &&
    value.entries.every((entry: unknown) => {
      if (!record(entry) || !validDrama(entry.drama)) return false;
      return (
        optionalNumber(entry.duration, 86400) &&
        optionalNumber(entry.position, 86400) &&
        optionalNumber(entry.last_played_at, Number.MAX_SAFE_INTEGER, true) &&
        (entry.episode === undefined ||
          (typeof entry.episode === 'number' &&
            Number.isInteger(entry.episode) &&
            // Cloud history may not have a playable episode yet; Progress writes remain one-based.
            entry.episode >= 0 &&
            entry.episode <= 10000)) &&
        (entry.video_id === undefined || decimalId(entry.video_id)) &&
        (entry.completed === undefined || typeof entry.completed === 'boolean')
      );
    }) &&
    Array.isArray(value.favorites) &&
    value.favorites.every(
      (entry: unknown) =>
        record(entry) &&
        validDrama(entry.drama) &&
        typeof entry.favorite_at === 'number' &&
        Number.isSafeInteger(entry.favorite_at) &&
        entry.favorite_at > 0 &&
        Object.keys(entry).every((key) => key === 'drama' || key === 'favorite_at'),
    )
  );
}

/** One unresolved write is a barrier: only explicit resolve replays its immutable payload. */
export function createLibraryWriter(
  request: LibraryWriteRequest,
  canDispatch: () => boolean = () => true,
) {
  let session: string | undefined;
  let ownerId: string | undefined;
  let next = 1n;
  let pending: { operation_id: string; payload: string } | undefined;
  let running = false;
  const change = () => JSON.parse(pending!.payload) as LibraryChange;
  const failure = (code: string, message: string) =>
    new LibraryWriteError('unresolved', code, message, change(), pending!.operation_id, session);
  const checkAbort = (abort?: AbortSignal) => {
    if (abort?.aborted) throw failure('CORE_CANCELLED', '记录写入结果尚未确认，请重试确认。');
  };
  const checkOwner = () => {
    if (!canDispatch())
      throw failure('LIBRARY_OWNER_DISPOSED', '记录写入所属应用已关闭，不能继续派发。');
  };
  const send = async (abort?: AbortSignal): Promise<LibraryWriteResult> => {
    if (running) throw failure('LIBRARY_WRITE_BUSY', '记录写入尚未完成，请等待后再确认。');
    running = true;
    let terminalError: LibraryWriteError | undefined;
    try {
      checkOwner();
      checkAbort(abort);
      if (!session) {
        const opened = await request<unknown>('/api/v1/library/session', abort, {
          owner_id: ownerId,
        });
        checkAbort(abort);
        if (
          !record(opened) ||
          typeof opened.session_id !== 'string' ||
          !/^[a-f0-9]{32}$/.test(opened.session_id)
        )
          throw failure('LIBRARY_SESSION_INVALID', '记录写入会话无效，请重试确认。');
        session = opened.session_id;
      }
      // A lazy session response may outlive its controller or explicit shutdown lease.
      checkOwner();
      const operation = pending!;
      const receipt = await request<unknown>(
        `/api/v1/library/operation?session_id=${session}&operation_id=${operation.operation_id}`,
        abort,
        change(),
      );
      checkAbort(abort);
      if (
        !record(receipt) ||
        receipt.session_id !== session ||
        receipt.operation_id !== operation.operation_id ||
        !record(receipt.outcome)
      )
        throw failure('LIBRARY_RECEIPT_INVALID', '记录写入回执不匹配，请重试确认。');
      const outcome = receipt.outcome;
      if (
        outcome.status === 'committed' &&
        validLibrarySnapshot(outcome.library) &&
        (outcome.library.owner_id ?? '') === ownerId
      ) {
        const result = {
          change: change(),
          library: outcome.library,
          session_id: session,
          operation_id: operation.operation_id,
        };
        pending = undefined;
        return result;
      }
      if (
        outcome.status === 'failed' &&
        typeof outcome.code === 'string' &&
        outcome.code.length > 0 &&
        typeof outcome.error === 'string' &&
        outcome.error.length > 0
      ) {
        const error = new LibraryWriteError(
          'failed',
          outcome.code,
          outcome.error,
          change(),
          operation.operation_id,
          session,
        );
        pending = undefined;
        terminalError = error;
        throw error;
      }
      throw failure('LIBRARY_RECEIPT_INVALID', '记录写入回执无效，请重试确认。');
    } catch (cause) {
      // Error classes thrown by a transport are not receipts, even if they claim `failed`.
      if (terminalError && cause === terminalError) throw cause;
      throw failure(
        record(cause) && typeof cause.code === 'string' ? cause.code : 'LIBRARY_WRITE_UNRESOLVED',
        cause instanceof Error ? cause.message : '记录写入结果尚未确认，请重试确认。',
      );
    } finally {
      running = false;
    }
  };
  return {
    async write(input: LibraryChange, abort?: AbortSignal): Promise<LibraryWriteResult> {
      if (pending)
        throw failure('LIBRARY_WRITE_UNRESOLVED', '上一条记录写入结果尚未确认，请先确认。');
      // A private JSON snapshot also prevents callers or transports from mutating a replay.
      const payload = JSON.stringify(input);
      const snapshot: unknown = JSON.parse(payload);
      if (
        !record(snapshot) ||
        (snapshot.owner_id !== undefined &&
          snapshot.owner_id !== null &&
          snapshot.owner_id !== '' &&
          !decimalId(snapshot.owner_id))
      )
        throw new Error('记录所属账号无效，不能创建写入会话。');
      const inputOwner = (snapshot.owner_id as string | undefined) ?? '';
      if (ownerId !== undefined && ownerId !== inputOwner)
        throw new Error('记录所属账号已变化，不能复用写入会话。');
      ownerId = inputOwner;
      pending = { operation_id: String(next++), payload };
      return send(abort);
    },
    reset() {
      if (pending || running) throw new Error('记录写入尚未确认，不能重置会话。');
      session = undefined;
      ownerId = undefined;
      next = 1n;
    },
    async resolve(abort?: AbortSignal): Promise<LibraryWriteResult | undefined> {
      if (!pending) return undefined;
      return send(abort);
    },
  };
}
