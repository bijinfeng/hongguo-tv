import type { Drama, Episode, PlayInfo, SearchResult } from '@hongguo/contracts';
export type * from '@hongguo/contracts';

let coreOrigin = '';

/** Configure one transport before mounting the shared application. */
export function configureClient(origin: string) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('Invalid core origin');
  coreOrigin = origin;
}

export async function request<T>(path: string, abort?: AbortSignal, body?: unknown): Promise<T> {
  if (!coreOrigin) throw new Error('Core client is not configured');
  const response = await fetch(coreOrigin + path, {
    signal: abort,
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as { ok: boolean; error?: string; data: T };
  if (!response.ok || !result.ok) throw new Error(result.error || `服务返回 ${response.status}`);
  return result.data;
}
export const search = (q: string, abort: AbortSignal) =>
  request<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`, abort);
export const detail = (drama: Drama, abort: AbortSignal) =>
  request<Drama>(
    `/api/v1/series/detail?series_id=${drama.series_id}&content_type=${drama.content_type ?? ''}`,
    abort,
  );
export const play = async (drama: Drama, episode: Episode, abort: AbortSignal) => {
  const info = await request<PlayInfo>(
    `/api/v1/play/info?series_id=${drama.series_id}&vid=${episode.video_id}&mode=range&codec_mode=default&content_type=${drama.content_type ?? ''}`,
    abort,
  );
  return { ...info, url: mediaURL(info.path) };
};
export function mediaURL(path: string) {
  const url = new URL(path, coreOrigin);
  // Playback is served through the core; never send native players to arbitrary schemes/hosts.
  if (url.origin !== coreOrigin || !url.pathname.startsWith('/minireel-proxy/media/'))
    throw new Error('播放地址不受支持');
  return url.href;
}

/** Keep the library contract below the core's 32 KiB boundary. */
export function libraryDrama(drama: Drama): Drama {
  return {
    series_id: drama.series_id,
    title: drama.title,
    cover: drama.cover,
    ...(drama.cover_fallback ? { cover_fallback: drama.cover_fallback } : {}),
    intro: Array.from(drama.intro || '')
      .slice(0, 1000)
      .join(''),
    episode_count: drama.episode_count,
    tags: drama.tags?.slice(0, 8),
    content_type: drama.content_type,
  };
}
