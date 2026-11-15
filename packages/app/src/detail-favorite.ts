import { signal } from 'nsh';
import type { Drama } from '@hongguo/core-client';
import type { Store } from './store';
import { errorMessage } from './error-messages';

/** Both detail layouts use the selected series and the store's durable membership. */
export function createDetailFavorite(
  store: Pick<
    Store,
    'account' | 'library' | 'favoriteOperation' | 'isFavorite' | 'setFavorite' | 'retryFavorite'
  >,
  summary: () => Drama | undefined,
  active: () => boolean,
) {
  const failure = signal<{ key: string; message: string } | undefined>(undefined);
  const scope = () =>
    JSON.stringify([store.library()?.owner_id ?? '', store.account()?.owner_epoch]);
  const key = () => JSON.stringify([scope(), summary()?.series_id, summary()?.content_type]);
  const enabled = () =>
    active() &&
    !!summary() &&
    summary()?.content_type !== '1003' &&
    !!store.library() &&
    !!store.account() &&
    (store.account()?.owner_id ?? '') === (store.library()?.owner_id ?? '');
  const ownedOperation = () => {
    const job = store.favoriteOperation();
    return job?.ownerId === (store.library()?.owner_id ?? '') &&
      job?.ownerEpoch === store.account()?.owner_epoch
      ? job
      : undefined;
  };
  const operation = () =>
    ownedOperation()?.seriesId === summary()?.series_id ? ownedOperation() : undefined;
  const recovery = () =>
    operation() ?? (ownedOperation()?.status === 'unresolved' ? ownedOperation() : undefined);
  const unsettled = () => {
    const job = ownedOperation();
    return job?.status === 'pending' || job?.status === 'unresolved';
  };
  const failed = () => ['failed', 'unresolved'].includes(operation()?.status ?? '');
  const run = async (retry: boolean) => {
    if (!enabled()) return;
    const drama = summary()!;
    const job = recovery();
    if (retry ? !['failed', 'unresolved'].includes(job?.status ?? '') : unsettled() || failed())
      return;
    const owned = key();
    failure.set(undefined);
    try {
      if (retry) await store.retryFavorite(job!.id);
      else await store.setFavorite(drama, !store.isFavorite(drama));
    } catch (cause) {
      if (active() && owned === key())
        failure.set({ key: owned, message: errorMessage(cause, '收藏未保存，请重试。') });
    }
  };
  return {
    selected: () => !!summary() && store.isFavorite(summary()!),
    pending: () => operation()?.status === 'pending',
    disabled: () => !enabled() || unsettled() || failed(),
    retryable: () => enabled() && ['failed', 'unresolved'].includes(recovery()?.status ?? ''),
    retryLabel: () =>
      !operation() && recovery()?.status === 'unresolved'
        ? '确认上一条收藏结果'
        : operation()?.status === 'unresolved'
          ? '确认收藏结果'
          : operation()?.value
            ? '重试收藏'
            : '重试取消收藏',
    message: () =>
      (failure()?.key === key() ? failure()?.message : '') ||
      (failed() ? operation()?.error || '收藏结果尚未确认，请重试。' : '') ||
      (!operation() && ownedOperation()?.status === 'unresolved'
        ? '上一条收藏结果尚未确认，请先确认结果后再继续收藏。'
        : ''),
    press: () => run(false),
    retry: () => run(true),
  };
}
