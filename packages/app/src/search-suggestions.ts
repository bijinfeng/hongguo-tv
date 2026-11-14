import { cleanup, effect, signal } from 'nsh';
import {
  type SearchSuggestion,
  type SearchSuggestions,
  type captureRequest,
} from '@hongguo/core-client';
import { suggestionInput } from './search-input';

const id = (value?: string) => !!value && /^(?=.*[1-9])[0-9]{1,32}$/.test(value);
export const suggestionAction = (item: SearchSuggestion) =>
  item.kind === 'short_play_actor' && id(item.actor_id)
    ? 'actor'
    : item.kind === 'short_play_name' && id(item.drama?.series_id)
      ? 'drama'
      : 'query';
export const suggestionIdentity = (item: SearchSuggestion) => {
  const action = suggestionAction(item);
  return `${action}:${action === 'actor' ? item.actor_id : action === 'drama' ? item.drama!.series_id : item.name}`;
};

/** One input interaction; a response can act only while it still owns the current draft. */
export function createSearchSuggestions(
  request: ReturnType<typeof captureRequest>,
  draft: () => string,
  active: () => boolean,
) {
  const engaged = signal(false);
  const composing = signal(false);
  const data = signal<SearchSuggestions | undefined>(undefined);
  const loading = signal(false);
  const error = signal('');
  const refresh = signal(0);
  let cached: { query: string; data: SearchSuggestions } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  let generation = 0;
  let disposed = false;
  const eligible = () => active() && engaged() && !composing() && !!suggestionInput(draft());
  const cancel = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  effect(() => {
    const raw = draft();
    const query = suggestionInput(raw);
    const available = active();
    const enabled = engaged();
    const marked = composing();
    void refresh();
    cancel();
    if (cached?.query !== query) {
      cached = undefined;
      data.set(undefined);
      error.set('');
    }
    if (!available) engaged.set(false);
    if (!available || !enabled || marked || !query) return;
    if (cached) {
      data.set(cached.data);
      return;
    }
    const owned = generation;
    timer = setTimeout(async () => {
      timer = undefined;
      const controller = new AbortController();
      abort = controller;
      const owns = () =>
        !disposed &&
        owned === generation &&
        !controller.signal.aborted &&
        raw === draft() &&
        eligible();
      loading.set(true);
      error.set('');
      try {
        const result = await request<SearchSuggestions>(
          `/api/v1/search/suggestions?q=${encodeURIComponent(query)}`,
          controller.signal,
        );
        if (!owns()) return;
        const seen = new Set<string>();
        const current = {
          items: result.items.filter((item) => {
            const identity = suggestionIdentity(item);
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          }),
        };
        cached = { query, data: current };
        data.set(current);
      } catch (cause) {
        if (owns())
          error.set(`建议加载失败：${cause instanceof Error ? cause.message : String(cause)}`);
      } finally {
        if (owns()) {
          loading.set(false);
          abort = undefined;
        }
      }
    }, 240);
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  return {
    composing,
    loading,
    error,
    items: () => data()?.items ?? [],
    open: () => eligible() && (data() !== undefined || loading() || !!error()),
    focus() {
      engaged.set(true);
    },
    dismiss() {
      cancel();
      engaged.set(false);
    },
    composition(value: boolean) {
      if (value) cancel();
      composing.set(value);
    },
    retry() {
      cached = undefined;
      data.set(undefined);
      engaged.set(true);
      refresh.update((n) => n + 1);
    },
    owns: (item: SearchSuggestion) =>
      eligible() && !loading() && (data()?.items.includes(item) ?? false),
  };
}
