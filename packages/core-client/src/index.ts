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

/** Stable core error category alongside the human recovery message. */
export class CoreError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, abort?: AbortSignal, body?: unknown): Promise<T> {
  if (!coreOrigin) throw new Error('Core client is not configured');
  const response = await fetch(coreOrigin + path, {
    signal: abort,
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as { ok: boolean; error?: string; code?: string; data: T };
  if (!response.ok || !result.ok)
    throw new CoreError(
      result.error || `服务返回 ${response.status}`,
      result.code || 'CORE_REQUEST_FAILED',
      response.status,
    );
  return result.data;
}
export const search = (q: string, abort: AbortSignal) =>
  request<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}`, abort);
export const detail = (drama: Drama, abort: AbortSignal) =>
  request<Drama>(
    `/api/v1/series/detail?series_id=${drama.series_id}&content_type=${drama.content_type ?? ''}`,
    abort,
  );
/** Options for one episode representation; automatic quality preserves the existing default. */
export interface PlaybackOptions {
  quality?: string;
  codecMode?: 'default' | 'auto' | 'software';
}
export const play = async (
  drama: Drama,
  episode: Episode,
  abort: AbortSignal,
  options: PlaybackOptions = {},
) => {
  const info = await request<PlayInfo>(
    `/api/v1/play/info?series_id=${encodeURIComponent(drama.series_id)}&vid=${encodeURIComponent(episode.video_id)}&mode=range&codec_mode=${options.codecMode ?? 'default'}&content_type=${encodeURIComponent(drama.content_type ?? '')}&quality=${encodeURIComponent(options.quality ?? '')}`,
    abort,
  );
  const url = mediaURL(info.path);
  if (info.vid !== episode.video_id)
    throw new CoreError('视频来源与所选集数不一致，请重试', 'PLAYBACK_IDENTITY_MISMATCH', 409);
  return { ...info, url };
};
const mediaPath = /^\/minireel-proxy\/media\/[a-f0-9]{64}$/;
export function mediaURL(path: string) {
  // The 24-character .mp4 path is retained solely for the read-only legacy transport.
  if (!coreOrigin || !/^\/minireel-proxy\/media\/(?:[a-f0-9]{64}|[a-f0-9]{24}\.mp4)$/.test(path))
    throw new Error('播放地址不受支持');
  return coreOrigin + path;
}
/** Idempotent release of a ready representation, including one that has already expired. */
export function releasePlay(path: string, abort?: AbortSignal) {
  if (!mediaPath.test(path)) return Promise.reject(new Error('播放地址不受支持'));
  return request<{ released: boolean }>('/api/v1/play/release', abort, { path });
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
