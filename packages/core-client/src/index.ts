import type { Drama, Episode, PlayInfo, SearchResult } from '@hongguo/contracts';
export type * from '@hongguo/contracts';

/** One host-owned transport; shared pages never import native modules. */
export interface CoreTransport {
  mediaOrigin: string;
  request(path: string, abort?: AbortSignal, body?: unknown): Promise<unknown>;
}

let transport: CoreTransport | undefined;

function validOrigin(origin: string) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin)
    throw new Error('Invalid core origin');
  return origin;
}

/** Install a transport before mounting the shared application. */
export function configureTransport(next: CoreTransport) {
  validOrigin(next.mediaOrigin);
  transport = next;
}

/** Configure one transport before mounting the shared application. */
export function configureClient(origin: string) {
  validOrigin(origin);
  configureTransport({
    mediaOrigin: origin,
    async request(path, abort, body) {
      const response = await fetch(origin + path, {
        signal: abort,
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return responseData(response.status, await response.json());
    },
  });
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

/** Decode the common native/HTTP envelope without losing machine-readable failures. */
export function responseData(status: number, value: unknown): unknown {
  if (!Number.isInteger(status) || status < 100 || status > 599)
    throw new CoreError('核心响应无效，请重试', 'CORE_RESPONSE_INVALID', 502);
  const result = value as { ok?: boolean; error?: string; code?: string; data?: unknown } | null;
  if (status < 200 || status >= 300 || result?.ok !== true)
    throw new CoreError(
      typeof result?.error === 'string' ? result.error : `服务返回 ${status}`,
      typeof result?.code === 'string' ? result.code : 'CORE_REQUEST_FAILED',
      status,
    );
  return result.data;
}

function currentTransport() {
  if (!transport) throw new Error('Core client is not configured');
  return transport;
}

export async function request<T>(path: string, abort?: AbortSignal, body?: unknown): Promise<T> {
  return (await currentTransport().request(path, abort, body)) as T;
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
  const owner = currentTransport();
  const info = (await owner.request(
    `/api/v1/play/info?series_id=${encodeURIComponent(drama.series_id)}&vid=${encodeURIComponent(episode.video_id)}&mode=range&codec_mode=${options.codecMode ?? 'default'}&content_type=${encodeURIComponent(drama.content_type ?? '')}&quality=${encodeURIComponent(options.quality ?? '')}`,
    abort,
  )) as PlayInfo;
  // A prepared handle always releases through the same transport that issued it.
  const release = async () => {
    if (mediaPath.test(info?.path))
      await owner.request('/api/v1/play/release', undefined, { path: info.path });
  };
  try {
    const url = resolvedMediaURL(info.path, owner.mediaOrigin);
    if (info.vid !== episode.video_id)
      throw new CoreError('视频来源与所选集数不一致，请重试', 'PLAYBACK_IDENTITY_MISMATCH', 409);
    return { ...info, url, release };
  } catch (error) {
    await release().catch(() => console.warn('Rejected playback resource release failed'));
    throw error;
  }
};
const mediaPath = /^\/minireel-proxy\/media\/[a-f0-9]{64}$/;
export function mediaURL(path: string) {
  return resolvedMediaURL(path, currentTransport().mediaOrigin);
}
function resolvedMediaURL(path: string, origin: string) {
  // The 24-character .mp4 path is retained solely for the read-only legacy transport.
  if (!/^\/minireel-proxy\/media\/(?:[a-f0-9]{64}|[a-f0-9]{24}\.mp4)$/.test(path))
    throw new Error('播放地址不受支持');
  return validOrigin(origin) + path;
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
