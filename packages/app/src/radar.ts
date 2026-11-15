import { batch, cleanup, effect, lifecycle, signal } from 'nsh';
import type {
  captureRequest,
  Drama,
  RadarSnapshot,
  RadarGrowthItem,
  RadarKind,
} from '@hongguo/core-client';
import { errorMessage } from './error-messages';

export type RadarView = 'snapshot' | 'growth';
export type RadarCategory = 'hot' | 'real' | 'ai' | 'comic';
export type RadarMetric = 'd_hot' | 'd_fav' | 'r_hot';
export type RadarRow = { id: string; title: string; cells: Record<string, string> };
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value);
const decimal = (value: unknown): value is string =>
  typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value);

/** Compare decimal wire integers without rounding them through a JS number. */
export function compareRadarInteger(left: string, right: string): number {
  const negativeLeft = left.startsWith('-') && left !== '-0';
  const negativeRight = right.startsWith('-') && right !== '-0';
  if (negativeLeft !== negativeRight) return negativeLeft ? -1 : 1;
  const a = left.replace(/^-/, '');
  const b = right.replace(/^-/, '');
  const order = a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
  return negativeLeft ? -order : order;
}

export function radarInteger(value: string | null | undefined, signed = false): string {
  if (!decimal(value)) return '—';
  const negative = value.startsWith('-') && value !== '-0';
  const digits = value.replace(/^-/, '');
  const prefix = negative ? '−' : signed && digits !== '0' ? '+' : '';
  return prefix + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const number = (value: number | null | undefined) => (value == null ? '—' : String(value));
const kinds: Record<string, string> = { real: '真人', ai: 'AI', comic: '漫剧', unknown: '未知' };
const kind = (value: string | null | undefined) => kinds[value ?? ''] ?? '—';
export function radarRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const percent = value * 100;
  if (Number.isFinite(percent)) return `${Number(percent.toFixed(2))}%`;
  // Scaling the exponent preserves a finite source ratio whose percentage exceeds f64.
  const [coefficient, exponent] = value.toExponential().split('e');
  return `${coefficient}e+${Number(exponent) + 2}%`;
}
const validDetail = (value: Drama | undefined, id: string): value is Drama =>
  !!value &&
  value.series_id === id &&
  typeof value.title === 'string' &&
  !!value.title.trim() &&
  typeof value.cover === 'string' &&
  typeof value.intro === 'string' &&
  Array.isArray(value.episodes) &&
  value.episodes.length <= 10000;

/** One read-only radar owner. Display settings do not become transport parameters. */
export function createRadar(request: ReturnType<typeof captureRequest>, active: () => boolean) {
  const data = signal<RadarSnapshot | undefined>(undefined);
  const view = signal<RadarView>('snapshot');
  const category = signal<RadarCategory>('hot');
  const metric = signal<RadarMetric>('d_hot');
  const type = signal<RadarKind | 'all'>('all');
  const loading = signal(false);
  const error = signal('');
  const selected = signal('');
  const pending = signal('');
  const detailError = signal<{ id: string; message: string } | undefined>(undefined);
  let disposed = false;
  let revision = 0;
  let detailRevision = 0;
  let abort: AbortController | undefined;
  let detailAbort: AbortController | undefined;
  const enabled = () => !disposed && active() && lifecycle() !== 'background';
  const key = () => JSON.stringify([view(), category(), metric(), type()]);
  const cancelDetail = () => {
    detailRevision++;
    detailAbort?.abort();
    detailAbort = undefined;
    pending.set('');
  };
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
    cancelDetail();
  };
  const rows = (): RadarRow[] => {
    const snapshot = data();
    const growth = snapshot?.growth?.items ?? [];
    const cells = (item?: RadarGrowthItem) => ({
      type: kind(item?.type),
      hot: radarInteger(item?.hot),
      d_hot: radarInteger(item?.d_hot, true),
      d_fav: radarInteger(item?.d_fav, true),
      r_hot: radarRate(item?.r_hot),
      d7_hot: radarInteger(item?.d7_hot, true),
    });
    if (view() === 'snapshot') {
      const byId = new Map(growth.map((item) => [item.id, item]));
      return (snapshot?.ranks?.[category()]?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        cells: {
          ...cells(byId.get(item.id)),
          rank: number(item.rank),
          delta:
            item.delta == null
              ? item.badge || '—'
              : item.delta === 0
                ? '持平'
                : `${item.delta > 0 ? '上升' : '下降'} ${Math.abs(item.delta)}`,
          streak: item.streak == null ? '—' : `${item.streak}天`,
        },
      }));
    }
    return growth
      .filter((item) => type() === 'all' || item.type === type())
      .slice()
      .sort((a, b) => {
        const left = a[metric()];
        const right = b[metric()];
        if (left == null) return right == null ? 0 : 1;
        if (right == null) return -1;
        return metric() === 'r_hot'
          ? (right as number) - (left as number)
          : compareRadarInteger(right as string, left as string);
      })
      .map((item, index) => ({
        id: item.id,
        title: item.title,
        cells: { ...cells(item), rank: String(index + 1) },
      }));
  };
  const read = async () => {
    if (!enabled() || loading()) return;
    const owner = ++revision;
    const controller = new AbortController();
    abort = controller;
    const owns = () => owner === revision && enabled() && !controller.signal.aborted;
    loading.set(true);
    error.set('');
    try {
      const next = await request<RadarSnapshot>('/api/v1/radar', controller.signal);
      if (!owns()) return;
      if (
        !next ||
        typeof next.ranks_stale !== 'boolean' ||
        typeof next.growth_stale !== 'boolean' ||
        typeof next.cache_write_failed !== 'boolean' ||
        (!next.ranks && !next.growth)
      )
        throw new Error('Invalid radar snapshot');
      const prior = data();
      data.set({
        ...next,
        ranks: next.ranks ?? prior?.ranks,
        growth: next.growth ?? prior?.growth,
        ranks_stale: !next.ranks || next.ranks_stale,
        growth_stale: !next.growth || next.growth_stale,
        ranks_fetched_at: next.ranks ? next.ranks_fetched_at : prior?.ranks_fetched_at,
        growth_fetched_at: next.growth ? next.growth_fetched_at : prior?.growth_fetched_at,
      });
    } catch (failure) {
      if (owns()) error.set(errorMessage(failure, '雷达读取失败'));
    } finally {
      if (owns()) {
        abort = undefined;
        loading.set(false);
      }
    }
  };
  effect(() => {
    if (!enabled()) {
      cancel();
      return;
    }
    if (!data() && !loading() && !error()) void read();
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  const change = (next: () => void) => {
    cancelDetail();
    batch(() => {
      next();
      selected.set('');
      detailError.set(undefined);
    });
  };
  return {
    data,
    view,
    category,
    metric,
    type,
    loading,
    error,
    selected,
    pending,
    detailError,
    key,
    rows,
    refresh() {
      void read();
    },
    changeView(value: RadarView) {
      if (view() !== value) change(() => view.set(value));
    },
    changeCategory(value: RadarCategory) {
      if (category() !== value) change(() => category.set(value));
    },
    changeMetric(value: RadarMetric) {
      if (metric() !== value) change(() => metric.set(value));
    },
    changeType(value: RadarKind | 'all') {
      if (type() !== value) change(() => type.set(value));
    },
    async open(id: string, ownsFocus: () => boolean, onOpen: (drama: Drama) => void) {
      if (!enabled() || !validId(id) || !rows().some((item) => item.id === id) || pending() === id)
        return;
      cancelDetail();
      const owner = ++detailRevision;
      const collection = key();
      const controller = new AbortController();
      detailAbort = controller;
      const owns = () =>
        owner === detailRevision &&
        enabled() &&
        !controller.signal.aborted &&
        collection === key() &&
        rows().some((item) => item.id === id);
      selected.set(id);
      pending.set(id);
      // Keep a focused retry mounted while its request runs.
      if (detailError()?.id !== id) detailError.set(undefined);
      try {
        const result = await request<Drama>(
          `/api/v1/series/detail?series_id=${encodeURIComponent(id)}&content_type=`,
          controller.signal,
        );
        if (!owns() || !ownsFocus()) return;
        if (!validDetail(result, id)) throw new Error('Radar detail identity mismatch');
        onOpen(result);
        detailError.set(undefined);
      } catch (failure) {
        if (owns() && ownsFocus())
          detailError.set({ id, message: errorMessage(failure, '详情读取失败') });
      } finally {
        if (owner === detailRevision) {
          detailAbort = undefined;
          pending.set('');
        }
      }
    },
  };
}

export type RadarController = ReturnType<typeof createRadar>;
