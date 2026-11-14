import { cleanup, effect, lifecycle, signal, untracked } from 'nsh';
import type { captureRequest, Drama, Episode } from '@hongguo/core-client';
import { errorMessage } from './error-messages';
import type { SeasonsController } from './seasons';

const validId = (id: unknown): id is string =>
  typeof id === 'string' && /^[0-9]{1,32}$/.test(id) && /[1-9]/.test(id);
const identity = (drama: Drama | undefined) =>
  drama ? JSON.stringify([drama.series_id, drama.content_type ?? '']) : '';
const validEpisode = (episode: Episode | undefined): episode is Episode =>
  !!episode &&
  validId(episode.video_id) &&
  Number.isInteger(episode.index) &&
  episode.index > 0 &&
  episode.index <= 10000 &&
  typeof episode.locked === 'boolean';

/** Membership has no implicit season identity: callers supply the verified selected drama. */
export function seasonEpisode(
  drama: Drama | undefined,
  episode: Episode | undefined,
): Episode | undefined {
  if (!drama || !validId(drama.series_id) || !validEpisode(episode) || episode.locked) return;
  const episodes = drama.episodes;
  if (!Array.isArray(episodes) || episodes.length > 10000) return;
  const matches = episodes.filter(
    (item) => item?.video_id === episode.video_id || item?.index === episode.index,
  );
  const match = matches[0];
  return matches.length === 1 &&
    validEpisode(match) &&
    !match.locked &&
    match.video_id === episode.video_id &&
    match.index === episode.index
    ? match
    : undefined;
}

function validDetail(drama: Drama | undefined, selected: Drama): drama is Drama {
  if (
    !drama ||
    !validId(drama.series_id) ||
    drama.series_id !== selected.series_id ||
    (selected.content_type !== undefined &&
      drama.content_type !== undefined &&
      drama.content_type !== selected.content_type) ||
    typeof drama.title !== 'string' ||
    typeof drama.cover !== 'string' ||
    typeof drama.intro !== 'string' ||
    !Array.isArray(drama.episodes) ||
    drama.episodes.length > 10000 ||
    (drama.episode_count !== undefined &&
      (!Number.isInteger(drama.episode_count) ||
        drama.episode_count < 0 ||
        drama.episode_count > 10000))
  )
    return false;
  const videos = new Set<string>();
  const indexes = new Set<number>();
  for (const episode of drama.episodes) {
    if (!validEpisode(episode) || videos.has(episode.video_id) || indexes.has(episode.index))
      return false;
    videos.add(episode.video_id);
    indexes.add(episode.index);
  }
  return true;
}

/** Read-only browsing details; media, history and playback identity belong to the page. */
export function createSeasonDetail(
  request: ReturnType<typeof captureRequest>,
  seasons: SeasonsController,
  active: () => boolean,
) {
  const cache = signal(new Map<string, Drama>());
  const pending = signal('');
  const failure = signal({ key: '', message: '' });
  let revision = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  let watched = '';
  let source = '';
  const selected = () => seasons.selectedDrama();
  const key = () => identity(selected());
  const allowed = () =>
    seasons.availability() === 'playable' ||
    (seasons.availability() === 'unknown' && selected()?.series_id === seasons.source()?.series_id);
  const enabled = () => !disposed && active() && lifecycle() !== 'background';
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    pending.set('');
  };
  const read = async () => {
    const chosen = selected();
    if (!chosen || !validId(chosen.series_id) || !enabled() || !allowed() || pending()) return;
    const owner = ++revision;
    const ownedKey = identity(chosen);
    const ownedSource = identity(seasons.source());
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      owner === revision &&
      !controller.signal.aborted &&
      ownedKey === key() &&
      ownedSource === identity(seasons.source()) &&
      enabled() &&
      allowed();
    pending.set(ownedKey);
    failure.set({ key: ownedKey, message: '' });
    try {
      const result = await request<Drama>(
        `/api/v1/series/detail?series_id=${encodeURIComponent(chosen.series_id)}&content_type=${encodeURIComponent(chosen.content_type ?? '')}`,
        controller.signal,
      );
      if (!owns()) return;
      if (!validDetail(result, chosen)) throw new Error('Season detail identity mismatch');
      cache.set(
        new Map(cache()).set(ownedKey, {
          ...chosen,
          ...result,
          content_type: result.content_type ?? chosen.content_type,
          title: result.title || chosen.title,
          cover: result.cover || chosen.cover,
          cover_fallback: result.cover_fallback || chosen.cover_fallback,
          intro: result.intro || chosen.intro,
          tags: result.tags ?? chosen.tags,
        }),
      );
    } catch (error) {
      if (owns()) failure.set({ key: ownedKey, message: errorMessage(error, '选集加载失败') });
    } finally {
      if (owns()) {
        abort = undefined;
        pending.set('');
      }
    }
  };
  effect(() => {
    const chosen = selected();
    const next = identity(chosen);
    const origin = identity(seasons.source());
    const visible = enabled();
    const readable = allowed();
    untracked(() => {
      if (watched !== next || source !== origin || !visible || !readable) {
        cancel();
        watched = next;
        source = origin;
        failure.set({ key: next, message: '' });
      }
      if (!visible || !readable || !chosen || !next || cache().has(next)) return;
      if (validDetail(chosen, chosen)) cache.set(new Map(cache()).set(next, chosen));
      else if (!pending() && !failure().message) void read();
    });
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  const drama = () => (allowed() ? cache().get(key()) : undefined);
  return {
    drama,
    summary: () => drama() ?? selected(),
    loading: () => allowed() && pending() === key() && !!pending(),
    error: () => (allowed() && failure().key === key() ? failure().message : ''),
    retry() {
      if (!cache().has(key())) void read();
    },
  };
}
