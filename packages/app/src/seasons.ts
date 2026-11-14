import { batch, cleanup, effect, lifecycle, signal, untracked } from 'nsh';
import type {
  captureRequest,
  Drama,
  Episode,
  NextSeasonResult,
  SeriesSeason,
  SeriesSeasonsResult,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

export type SeasonAvailability = 'playable' | 'upcoming' | 'unavailable' | 'unknown';
export type SeasonStart = { drama: Drama; episode: Episode };
export type SeasonsController = ReturnType<typeof createSeasons>;
const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9]{1,32}$/.test(id) && /[1-9]/.test(id);
const summary = (drama: Drama | undefined): drama is Drama =>
  !!drama &&
  validId(drama.series_id) &&
  typeof drama.title === 'string' &&
  typeof drama.cover === 'string' &&
  typeof drama.intro === 'string';
const sourceIdentity = (drama: Drama | undefined) =>
  JSON.stringify([drama?.series_id ?? '', drama?.content_type ?? '']);
const validSeason = (row: SeriesSeason): boolean =>
  !!row &&
  summary(row.drama) &&
  typeof row.playable === 'boolean' &&
  typeof row.upcoming === 'boolean' &&
  !(row.playable && row.upcoming) &&
  (row.playable
    ? validId(row.first_video_id) &&
      Number.isInteger(row.drama.episode_count) &&
      (row.drama.episode_count ?? 0) > 0 &&
      (row.drama.episode_count ?? 0) <= 10000
    : row.first_video_id === undefined) &&
  (row.reservation_id === undefined || row.reservation_id === row.drama.series_id) &&
  (row.season_index === undefined ||
    (Number.isInteger(row.season_index) && row.season_index > 0 && row.season_index <= 100000)) &&
  (row.label === undefined || typeof row.label === 'string') &&
  (row.subtitle === undefined || typeof row.subtitle === 'string');

/** A locked/missing next episode is not proof that a complete season has ended. */
export function isFinalEpisode(drama: Drama, episode: Episode): boolean {
  const episodes = drama.episodes;
  const total = drama.episode_count;
  if (
    !summary(drama) ||
    !episode ||
    !Array.isArray(episodes) ||
    !Number.isInteger(total) ||
    !total ||
    total > 10000 ||
    episodes.length !== total ||
    episode.locked !== false ||
    episode.index !== total
  )
    return false;
  const indexes = new Set<number>();
  const videos = new Set<string>();
  for (const item of episodes) {
    if (
      !item ||
      !Number.isInteger(item.index) ||
      item.index < 1 ||
      item.index > total ||
      !validId(item.video_id) ||
      typeof item.locked !== 'boolean' ||
      indexes.has(item.index) ||
      videos.has(item.video_id)
    )
      return false;
    indexes.add(item.index);
    videos.add(item.video_id);
  }
  return episodes.some(
    (item) => item.index === episode.index && item.video_id === episode.video_id && !item.locked,
  );
}

/** Read-only series context. The caller owns navigation, media and source-focus restoration. */
export function createSeasons(
  request: ReturnType<typeof captureRequest>,
  source: () => Drama | undefined,
  active: () => boolean,
) {
  const origin = signal<Drama | undefined>(undefined);
  const data = signal<SeriesSeasonsResult | undefined>(undefined);
  const selectedId = signal('');
  const loading = signal(false);
  const error = signal('');
  const nextLoading = signal(false);
  const nextError = signal('');
  const nextStatus = signal('');
  const nextResult = signal<SeasonStart | undefined>(undefined);
  let ownerId = '';
  let ownerKey = '';
  let disposed = false;
  let revision = 0;
  let nextRevision = 0;
  let abort: AbortController | undefined;
  let nextAbort: AbortController | undefined;
  let intent: SeasonStart | undefined;
  const enabled = () => !disposed && active() && lifecycle() !== 'background';
  const foreground = () => enabled() && lifecycle() === 'active';
  const cancelRead = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const cancelNext = () => {
    nextRevision++;
    nextAbort?.abort();
    nextAbort = undefined;
    intent = undefined;
    nextLoading.set(false);
    nextError.set('');
    nextStatus.set('');
    nextResult.set(undefined);
  };
  const read = async () => {
    if (!enabled() || loading() || !validId(ownerId)) return;
    const current = ++revision;
    const id = ownerId;
    const key = ownerKey;
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      current === revision &&
      key === ownerKey &&
      key === sourceIdentity(source()) &&
      id === ownerId &&
      id === source()?.series_id &&
      !controller.signal.aborted &&
      enabled();
    loading.set(true);
    error.set('');
    try {
      const result = await request<SeriesSeasonsResult>(
        `/api/v1/series/seasons?series_id=${encodeURIComponent(id)}`,
        controller.signal,
      );
      if (!owns()) return;
      if (
        !Array.isArray(result?.items) ||
        result.items.length > 1024 ||
        !result.items.every(validSeason) ||
        new Set(result.items.map((row) => row.drama.series_id)).size !== result.items.length
      )
        throw new Error('系列数据无效，请重试。');
      batch(() => {
        data.set(result);
        if (
          selectedId() !== ownerId &&
          !result.items.some((row) => row.drama.series_id === selectedId())
        ) {
          cancelNext();
          selectedId.set(ownerId);
        }
      });
    } catch (failure) {
      if (owns()) error.set(errorMessage(failure, '系列加载失败'));
    } finally {
      if (owns()) {
        abort = undefined;
        loading.set(false);
      }
    }
  };
  const selected = () => data()?.items.find((row) => row.drama.series_id === selectedId());
  const next = async (drama: Drama, episode: Episode): Promise<SeasonStart | undefined> => {
    if (
      !foreground() ||
      nextLoading() ||
      !isFinalEpisode(drama, episode) ||
      (drama.series_id !== ownerId &&
        !data()?.items.some((row) => row.drama.series_id === drama.series_id && row.playable))
    )
      return;
    cancelNext();
    intent = { drama, episode };
    const current = ++nextRevision;
    const originId = ownerId;
    const originKey = ownerKey;
    const controller = new AbortController();
    nextAbort = controller;
    const owns = () =>
      current === nextRevision &&
      originKey === ownerKey &&
      originKey === sourceIdentity(source()) &&
      originId === source()?.series_id &&
      !controller.signal.aborted &&
      foreground();
    nextLoading.set(true);
    try {
      const catalog = data();
      if (!catalog) throw new Error('系列尚未读取完成，请重试。');
      const currentRow = catalog.items.find((row) => row.drama.series_id === drama.series_id);
      let currentSeason = currentRow?.season_index;
      if (currentSeason === undefined) {
        const relation = await request<NextSeasonResult>(
          `/api/v1/series/next-season?series_id=${encodeURIComponent(drama.series_id)}`,
          controller.signal,
        );
        if (!owns()) return;
        if (
          !Number.isInteger(relation?.current_season) ||
          relation.current_season < 1 ||
          relation.current_season > 100000 ||
          (relation.next != null &&
            (!validSeason(relation.next) ||
              !relation.next.playable ||
              relation.next.upcoming ||
              (relation.next.season_index ?? 0) <= relation.current_season ||
              relation.next.drama.series_id === drama.series_id))
        )
          throw new Error('下一季关系无效，请重试。');
        currentSeason = relation.current_season;
      }
      if (catalog.items.filter((row) => row.season_index === currentSeason).length > 1)
        throw new Error('系列季号存在冲突，请重试。');
      // The complete selector owns adjacency; the relation endpoint can skip unreleased seasons.
      const adjacentIndex = currentSeason + 1;
      const adjacent = catalog.items.filter((row) => row.season_index === adjacentIndex);
      if (adjacent.length > 1) throw new Error('下一季关系存在冲突，请重试。');
      const candidate = adjacent[0];
      if (!candidate) {
        if (
          currentRow?.season_index === undefined ||
          catalog.items.some((row) => (row.season_index ?? 0) > adjacentIndex)
        )
          throw new Error('系列季列表不完整，请重试。');
        nextStatus.set('本季已播放完，暂无下一季。');
        return;
      }
      if (candidate.upcoming || !candidate.playable) {
        nextStatus.set(candidate.upcoming ? '本季已播放完，下一季待上线。' : '下一季暂不可观看。');
        return;
      }
      const detail = await request<Drama>(
        `/api/v1/series/detail?series_id=${encodeURIComponent(candidate.drama.series_id)}&content_type=${encodeURIComponent(candidate.drama.content_type ?? '')}`,
        controller.signal,
      );
      if (!owns()) return;
      const episodes = Array.isArray(detail?.episodes) ? detail.episodes : [];
      const first = episodes.find((item) => item?.video_id === candidate.first_video_id);
      if (
        !summary(detail) ||
        detail.series_id !== candidate.drama.series_id ||
        (detail.content_type !== undefined &&
          (detail.content_type ?? '') !== (candidate.drama.content_type ?? '')) ||
        episodes.length > 10000 ||
        !first ||
        first.locked !== false ||
        first.index !== 1 ||
        episodes.filter((item) => item?.video_id === candidate.first_video_id || item?.index === 1)
          .length !== 1 ||
        !validId(first.video_id)
      )
        throw new Error('下一季选集与来源不一致，请重试。');
      const result = {
        drama: { ...detail, content_type: detail.content_type ?? candidate.drama.content_type },
        episode: first,
      };
      nextResult.set(result);
      return result;
    } catch (failure) {
      if (owns()) nextError.set(errorMessage(failure, '下一季加载失败'));
    } finally {
      if (owns()) {
        nextAbort = undefined;
        nextLoading.set(false);
      }
    }
  };
  effect(() => {
    const current = source();
    const key = sourceIdentity(current);
    const visible = enabled();
    const canContinue = foreground();
    untracked(() => {
      if (key !== ownerKey) {
        batch(() => {
          cancelRead();
          cancelNext();
          ownerId = current?.series_id ?? '';
          ownerKey = key;
          origin.set(current);
          selectedId.set(ownerId);
          data.set(undefined);
          error.set('');
        });
      }
      if (!visible) cancelRead();
      else if (!data() && !loading() && !error()) void read();
      if (!canContinue) cancelNext();
    });
  });
  cleanup(() => {
    disposed = true;
    cancelRead();
    cancelNext();
  });
  return {
    source: () => origin(),
    items: () => data()?.items ?? [],
    selectedId: () => selectedId(),
    selected,
    selectedDrama: () => {
      const row = selected()?.drama;
      const original = origin();
      if (!row) return selectedId() === ownerId ? original : undefined;
      return row.series_id === original?.series_id && row.content_type === undefined
        ? { ...row, content_type: original.content_type }
        : row;
    },
    availability: (): SeasonAvailability => {
      const row = selected();
      return !row
        ? 'unknown'
        : row.upcoming
          ? 'upcoming'
          : row.playable
            ? 'playable'
            : 'unavailable';
    },
    loading,
    error,
    nextLoading,
    nextError,
    nextStatus,
    nextResult,
    next,
    cancelNext,
    retryNext: () => (intent ? next(intent.drama, intent.episode) : Promise.resolve(undefined)),
    select(id: string) {
      if (
        !enabled() ||
        (id !== ownerId && !data()?.items.some((row) => row.drama.series_id === id))
      )
        return false;
      const changed = id !== selectedId();
      batch(() => {
        cancelNext();
        if (changed) selectedId.set(id);
      });
      return changed;
    },
    retry() {
      void read();
    },
  };
}
