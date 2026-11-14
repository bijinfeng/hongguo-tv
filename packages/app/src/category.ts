import { batch, cleanup, effect, lifecycle, signal } from 'nsh';
import type { captureRequest, CategoryResult, CategoryFilterRow } from '@hongguo/core-client';

type Selection = { genre: string; category_dim_theme: string; sort: string };
export type CategoryChoice = { value: string; title: string };
export type CategoryDimension = keyof Selection;
const empty = (): Selection => ({ genre: '', category_dim_theme: '', sort: '' });
const dimensions: CategoryDimension[] = ['genre', 'category_dim_theme', 'sort'];

/** Page-owned, read-only category pages; hidden owners retain completed data, never pending work. */
export function createCategory(request: ReturnType<typeof captureRequest>, active: () => boolean) {
  const selection = signal(empty());
  const data = signal<CategoryResult | undefined>(undefined);
  const rows = signal<CategoryFilterRow[]>([]);
  const loading = signal(false);
  const error = signal('');
  const selected = signal('');
  let abort: AbortController | undefined;
  let revision = 0;
  let disposed = false;
  const key = () => JSON.stringify(selection());
  const enabled = () => active() && lifecycle() === 'active' && !disposed;
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const choices = (dimension: CategoryDimension): CategoryChoice[] => {
    const options = rows().find((row) => row.type === dimension)?.options ?? [];
    if (dimension === 'genre')
      return [
        { value: '', title: '全部' },
        ...options.flatMap((option) =>
          option.id === 'short_play'
            ? [{ value: option.id, title: '真人剧' }]
            : option.id === 'comic_series'
              ? [{ value: option.id, title: '漫剧' }]
              : [],
        ),
      ];
    if (dimension === 'sort')
      return [
        { value: '', title: '综合' },
        ...(['online_time', 'hot_score'] as const).flatMap((id) =>
          options.some((option) => option.id === id)
            ? [{ value: id, title: id === 'online_time' ? '最新' : '热度' }]
            : [],
        ),
      ];
    return [{ value: '', title: '全部' }, ...options.map((o) => ({ value: o.id, title: o.label }))];
  };
  const read = async (more = false) => {
    if (!enabled() || loading() || (more && !data()?.has_more)) return;
    const prior = more ? data() : undefined;
    const offset = prior?.next_offset ?? 0;
    if (more && (!Number.isInteger(offset) || offset < 1 || offset > 100000)) {
      error.set('分类分页数据无效，请重新筛选。');
      return;
    }
    const owner = ++revision;
    const controller = new AbortController();
    abort = controller;
    const owns = () => owner === revision && !controller.signal.aborted && enabled();
    const params = new URLSearchParams({ ...selection(), selectors: more ? '0' : '1' });
    if (prior) {
      params.set('offset', String(offset));
      params.set('session_id', prior.session_id);
      params.set(
        'shown',
        prior.items
          .slice(-128)
          .map((item) => item.series_id)
          .join(','),
      );
    }
    loading.set(true);
    error.set('');
    try {
      const next = await request<CategoryResult>(`/api/v1/category?${params}`, controller.signal);
      if (!owns()) return;
      if (
        !Array.isArray(next?.items) ||
        (next.filters !== undefined && !Array.isArray(next.filters)) ||
        typeof next.has_more !== 'boolean' ||
        typeof next.session_id !== 'string' ||
        !Number.isInteger(next.next_offset) ||
        next.next_offset < 0 ||
        next.next_offset > 100000 ||
        (next.has_more && next.next_offset <= offset)
      )
        throw new Error('分类数据无效，请重试。');
      const seen = new Set(prior?.items.map((item) => item.series_id));
      const added = next.items.filter((item) => {
        if (seen.has(item.series_id)) return false;
        seen.add(item.series_id);
        return true;
      });
      batch(() => {
        if (!more || next.filters?.length) {
          const retained = more
            ? rows()
            : rows().flatMap((row) => {
                const chosen = selection()[row.type as CategoryDimension];
                const option = row.options.find((o) => o.id === chosen);
                return option ? [{ ...row, options: [option] }] : [];
              });
          const merged = new Map(retained.map((row) => [row.type, row]));
          for (const row of next.filters ?? []) {
            const chosen = selection()[row.type as CategoryDimension];
            const priorOption = rows()
              .find((r) => r.type === row.type)
              ?.options.find((o) => o.id === chosen);
            merged.set(
              row.type,
              priorOption && !row.options.some((o) => o.id === chosen)
                ? { ...row, options: [...row.options, priorOption] }
                : row,
            );
          }
          rows.set([...merged.values()]);
        }
        data.set({ ...next, items: [...(prior?.items ?? []), ...added] });
      });
    } catch (failure) {
      if (owns())
        error.set(`加载失败：${failure instanceof Error ? failure.message : String(failure)}`);
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
    // Only activation starts a missing first page; failures require an explicit retry.
    if (!data() && !loading() && !error()) void read();
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  const select = (next: Selection) => {
    batch(() => {
      cancel();
      if (next.genre !== selection().genre)
        rows.set(rows().filter((r) => r.type !== 'category_dim_theme'));
      selection.set(next);
      data.set(undefined);
      selected.set('');
      error.set('');
    });
  };
  return {
    selection,
    data,
    loading,
    error,
    selected,
    key,
    choices,
    change(dimension: CategoryDimension, value: string) {
      if (
        !dimensions.includes(dimension) ||
        !choices(dimension).some((o) => o.value === value) ||
        selection()[dimension] === value
      )
        return;
      select({
        ...selection(),
        [dimension]: value,
        ...(dimension === 'genre' ? { category_dim_theme: '' } : {}),
      });
    },
    clear() {
      select(empty());
    },
    retry() {
      void read(!!data());
    },
    loadMore() {
      void read(true);
    },
  };
}
