import { cleanup, effect, lifecycle, signal, untracked } from 'nsh';
import type {
  captureRequest,
  Drama,
  Episode,
  SeriesActor,
  SeriesDetail,
} from '@hongguo/core-client';
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
    drama.content_type === '1003' ||
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

// Match catalog/series_detail.rs and actor_works.rs before accepting locally supplied DTOs.
const extrasLimit = 2048;
const encoder = new TextEncoder();
function boundedText(value: unknown, limit: number): string | undefined {
  if (
    typeof value !== 'string' ||
    encoder.encode(value).length > limit * 4 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    })
  )
    return;
  const text = value.trim();
  return text && [...text].length <= limit ? text : undefined;
}
function publicImage(value: unknown): string {
  if (typeof value !== 'string' || !value || encoder.encode(value).length > 2048) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      ['.byteimg.com', '.fqnovelpic.com'].some((host) => url.hostname.endsWith(host))
      ? value
      : '';
  } catch {
    return '';
  }
}
const completeExtras = (drama: Drama): drama is SeriesDetail => {
  const detail = drama as Partial<SeriesDetail>;
  return Array.isArray(detail.actors) && Array.isArray(detail.related);
};

/** Old detail endpoint fixtures omitted both arrays; endpoint completion still means they were read. */
function normalizeDetail(drama: Drama, selected: Drama): SeriesDetail | undefined {
  if (!validDetail(drama, selected)) return;
  const detail = drama as Partial<SeriesDetail>;
  if (
    (detail.actors !== undefined &&
      (!Array.isArray(detail.actors) || detail.actors.length > extrasLimit)) ||
    (detail.related !== undefined &&
      (!Array.isArray(detail.related) || detail.related.length > extrasLimit))
  )
    return;
  const actors: SeriesActor[] = [];
  const actorKeys = new Set<string>();
  for (const actor of detail.actors ?? []) {
    if (!actor) continue;
    const name = boundedText(actor.name, 100);
    if (!name) continue;
    const id = validId(actor.actor_id) ? actor.actor_id : undefined;
    const key = JSON.stringify([id !== undefined, id ?? name]);
    if (actorKeys.has(key)) continue;
    actorKeys.add(key);
    actors.push({ ...(id ? { actor_id: id } : {}), name, avatar: publicImage(actor.avatar) });
  }
  const related: Drama[] = [];
  const relatedIds = new Set<string>();
  for (const item of detail.related ?? []) {
    if (
      !item ||
      !validId(item.series_id) ||
      item.series_id === drama.series_id ||
      relatedIds.has(item.series_id) ||
      (item.content_type !== undefined && !['1', '7', '1004'].includes(item.content_type))
    )
      continue;
    if (typeof item.episode_count === 'number' && item.episode_count > 10000) return;
    relatedIds.add(item.series_id);
    related.push({
      series_id: item.series_id,
      title: boundedText(item.title, 100) ?? '未命名短剧',
      intro: boundedText(item.intro, 1024) ?? '',
      cover: publicImage(item.cover),
      ...(publicImage(item.cover_fallback)
        ? { cover_fallback: publicImage(item.cover_fallback) }
        : {}),
      ...(item.content_type !== undefined ? { content_type: item.content_type } : {}),
      ...(Number.isInteger(item.episode_count) &&
      item.episode_count! > 0 &&
      item.episode_count! <= 10000
        ? { episode_count: item.episode_count }
        : {}),
      ...(Array.isArray(item.tags)
        ? {
            tags: item.tags
              .slice(0, 16)
              .flatMap((tag) => {
                const text = boundedText(tag, 24);
                return text ? [text] : [];
              })
              .slice(0, 3),
          }
        : {}),
    });
  }
  return { ...drama, actors, related };
}

/** Read-only browsing details; media, history and playback identity belong to the page. */
export function createSeasonDetail(
  request: ReturnType<typeof captureRequest>,
  seasons: SeasonsController,
  active: () => boolean,
) {
  const cache = signal(new Map<string, SeriesDetail>());
  const pending = signal('');
  const failure = signal({ key: '', message: '' });
  let revision = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  let reading: { key: string } | undefined;
  let watched = { key: '', source: '', id: '', type: undefined as string | undefined };
  const selected = () => seasons.selectedDrama();
  const key = () => JSON.stringify([identity(seasons.source()), identity(selected())]);
  const supplied = () => {
    const chosen = selected();
    const origin = seasons.source();
    if (chosen && origin && chosen.series_id === origin.series_id && validDetail(origin, chosen))
      return { ...chosen, ...origin, content_type: origin.content_type ?? chosen.content_type };
    return chosen && validDetail(chosen, chosen) ? chosen : undefined;
  };
  const allowed = () =>
    seasons.availability() === 'playable' ||
    (seasons.availability() === 'unknown' && selected()?.series_id === seasons.source()?.series_id);
  const enabled = () => !disposed && active() && lifecycle() !== 'background';
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    reading = undefined;
    pending.set('');
  };
  const read = async () => {
    const chosen = selected();
    if (!chosen || !validId(chosen.series_id) || !enabled() || !allowed() || pending()) return;
    const owner = ++revision;
    const context = { key: key() };
    reading = context;
    const controller = new AbortController();
    abort = controller;
    const owns = () =>
      owner === revision &&
      reading === context &&
      !controller.signal.aborted &&
      context.key === key() &&
      enabled() &&
      allowed();
    pending.set(context.key);
    failure.set({ key: context.key, message: '' });
    try {
      const result = await request<SeriesDetail>(
        `/api/v1/series/detail?series_id=${encodeURIComponent(chosen.series_id)}&content_type=${encodeURIComponent(chosen.content_type ?? '')}`,
        controller.signal,
      );
      const current = selected();
      if (!owns() || !current) return;
      const detail = normalizeDetail(result, current);
      if (!detail) throw new Error('Season detail identity mismatch');
      cache.set(
        new Map(cache()).set(context.key, {
          ...current,
          ...detail,
          content_type: detail.content_type ?? current.content_type,
          title: detail.title || current.title,
          cover: detail.cover || current.cover,
          cover_fallback: detail.cover_fallback || current.cover_fallback,
          intro: detail.intro || current.intro,
          tags: detail.tags ?? current.tags,
        }),
      );
    } catch (error) {
      if (owns()) failure.set({ key: context.key, message: errorMessage(error, '详情加载失败') });
    } finally {
      if (owns()) {
        abort = undefined;
        reading = undefined;
        pending.set('');
      }
    }
  };
  effect(() => {
    const next = key();
    const chosen = selected();
    const current = {
      key: next,
      source: identity(seasons.source()),
      id: chosen?.series_id ?? '',
      type: chosen?.content_type,
    };
    const provided = supplied();
    const visible = enabled();
    const readable = allowed();
    untracked(() => {
      const refining =
        visible &&
        readable &&
        chosen &&
        watched.source === current.source &&
        watched.id === current.id &&
        watched.type === undefined &&
        !!current.type &&
        current.type !== '1003';
      if (refining) {
        // Season metadata can fill a search summary's type without changing its upstream detail.
        const previous = cache().get(watched.key);
        const detail = previous && normalizeDetail(previous, chosen);
        if (detail)
          cache.set(
            new Map(cache()).set(next, {
              ...detail,
              content_type: detail.content_type ?? chosen.content_type,
            }),
          );
        if (reading?.key === watched.key) {
          reading.key = next;
          pending.set(next);
        }
        if (failure().key === watched.key) failure.set({ ...failure(), key: next });
      }
      if ((watched.key !== next && !refining) || !visible || !readable) {
        cancel();
        failure.set({ key: next, message: '' });
      }
      watched = current;
      if (!visible || !readable || !selected() || cache().has(next)) return;
      const complete =
        provided && completeExtras(provided) ? normalizeDetail(provided, provided) : undefined;
      if (complete) cache.set(new Map(cache()).set(next, complete));
      else if (!pending() && !failure().message) void read();
    });
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  const detail = () => (allowed() ? cache().get(key()) : undefined);
  const drama = () => (allowed() ? (detail() ?? supplied()) : undefined);
  return {
    detail,
    drama,
    summary: () => drama() ?? selected(),
    loading: () => allowed() && pending() === key() && !!pending(),
    error: () => (allowed() && failure().key === key() ? failure().message : ''),
    retry() {
      if (!cache().has(key())) void read();
    },
  };
}
