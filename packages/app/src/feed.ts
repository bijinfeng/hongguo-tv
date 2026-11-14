import { batch, cleanup, effect, lifecycle, signal, untracked } from 'nsh';
import type { captureRequest, FeedResult } from '@hongguo/core-client';
import { errorMessage } from './error-messages';

export type FeedChannel = FeedResult['channel'] | '45';
type Session = { page?: FeedResult; index: number; error: string };
const empty = (): Session => ({ index: 0, error: '' });
const pair = (cell: string, plan: string) => /^\d{1,30}$/.test(cell) && /^\d{1,30}$/.test(plan);

/** One visible request owner; completed channel sessions survive navigation without persistence. */
export function createFeed(request: ReturnType<typeof captureRequest>, active: () => boolean) {
  const channel = signal<FeedChannel>('16');
  const sessions = signal<Partial<Record<FeedChannel, Session>>>({});
  const loading = signal(false);
  let revision = 0;
  let abort: AbortController | undefined;
  let disposed = false;
  const state = () => sessions()[channel()] ?? empty();
  const current = () => state().page?.items[state().index];
  const enabled = () => !disposed && active() && lifecycle() === 'active' && channel() !== '45';
  const write = (owner: FeedChannel, next: Session) =>
    sessions.update((all) => ({ ...all, [owner]: next }));
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const read = async () => {
    if (!enabled() || loading()) return;
    const ownerChannel = channel();
    const prior = state();
    const page = prior.page;
    if (page && !page.has_more) return;
    const params = new URLSearchParams({ channel: ownerChannel });
    if (page) {
      params.set('offset', String(page.next_offset));
      params.set('feed_cell', page.feed_cell);
      params.set('feed_plan', page.feed_plan);
      params.set('session_id', page.session_id);
      params.set(
        'shown',
        page.items
          .slice(-128)
          .map((item) => item.series_id)
          .join(','),
      );
    }
    const owner = ++revision;
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      owner === revision && !controller.signal.aborted && enabled() && channel() === ownerChannel;
    batch(() => {
      loading.set(true);
      write(ownerChannel, { ...prior, error: '' });
    });
    try {
      const next = await request<FeedResult>(
        `/api/v1/lists/recommend?${params}`,
        controller.signal,
      );
      if (!owns()) return;
      if (
        next?.channel !== ownerChannel ||
        !Array.isArray(next.items) ||
        typeof next.has_more !== 'boolean' ||
        typeof next.session_id !== 'string' ||
        typeof next.feed_cell !== 'string' ||
        typeof next.feed_plan !== 'string' ||
        !Number.isInteger(next.next_offset) ||
        next.next_offset < 0 ||
        next.next_offset > 100000 ||
        (next.has_more && !pair(next.feed_cell, next.feed_plan)) ||
        (page &&
          (next.feed_cell !== page.feed_cell ||
            next.feed_plan !== page.feed_plan ||
            (next.has_more && next.next_offset <= page.next_offset))) ||
        (!page && ownerChannel === '16' && next.has_more && next.next_offset === 0)
      )
        throw new Error('推荐数据无效，请重试。');
      const seen = new Set(page?.items.map((item) => item.series_id));
      const added = next.items.filter((item) => {
        if (seen.has(item.series_id)) return false;
        seen.add(item.series_id);
        return true;
      });
      write(ownerChannel, {
        page: { ...next, items: [...(page?.items ?? []), ...added] },
        index: page && added.length ? page.items.length : prior.index,
        error: '',
      });
    } catch (failure) {
      if (owns()) {
        console.warn('推荐加载失败', failure);
        write(ownerChannel, {
          ...prior,
          error: errorMessage(failure, '加载失败'),
        });
      }
    } finally {
      if (owns()) {
        abort = undefined;
        loading.set(false);
      }
    }
  };
  effect(() => {
    const visible = enabled();
    channel();
    untracked(() => {
      cancel();
      if (visible && !state().page && !state().error) void read();
    });
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  return {
    channel,
    current,
    loading,
    state,
    nextAvailable: () =>
      !!state().page && (state().index + 1 < state().page!.items.length || state().page!.has_more),
    select(next: FeedChannel) {
      if (!['16', '39', '36', '45'].includes(next) || next === channel()) return;
      batch(() => {
        cancel();
        channel.set(next);
      });
    },
    next() {
      if (!enabled() || loading()) return;
      const prior = state();
      if (prior.page && prior.index + 1 < prior.page.items.length)
        write(channel(), { ...prior, index: prior.index + 1, error: '' });
      else void read();
    },
    retry() {
      void read();
    },
  };
}
