import { batch, cleanup, effect, lifecycle, signal } from 'nsh';
import type { captureRequest, RankItem, RankOption, RankResult } from '@hongguo/core-client';
import { errorMessage } from './error-messages';

export type RankingDimension = 'rank' | 'rank_sub' | 'rank_panel';
export type RankingSelection = Partial<Record<RankingDimension, string>>;
export type RankingChoices = {
  id: string;
  dimension: RankingDimension;
  label: string;
  options: RankOption[];
  value?: string;
};

/** Actor and drama decimal IDs belong to different navigation namespaces. */
export function rankingIdentity(item: RankItem): string {
  return item.entry.kind === 'drama'
    ? `drama:${item.entry.drama.series_id}`
    : `actor:${item.entry.actor.id}`;
}

function branch(options: RankOption[], explicit?: string, includePanels = false): RankOption[] {
  if (explicit !== undefined) {
    for (const option of options) {
      if (option.id === explicit) return [option];
      const nested = branch(option.children, explicit, includePanels);
      if (nested.length) return [option, ...nested];
      // A nested panel keeps this ancestor selected without treating its choices as children.
      if (
        includePanels &&
        option.panels.some((panel) => branch(panel.options, explicit, true).length)
      )
        return [option];
    }
    return [];
  }
  const selected = options.find((option) => option.selected);
  return selected ? [selected, ...branch(selected.children, undefined, includePanels)] : [];
}

/** One read-only page owner. Default hints never rewrite explicit selection or request context. */
export function createRankings(request: ReturnType<typeof captureRequest>, active: () => boolean) {
  const selection = signal<RankingSelection>({});
  const data = signal<RankResult | undefined>(undefined);
  const ranks = signal<RankOption[]>([]);
  const loading = signal(false);
  const error = signal('');
  const selected = signal('');
  /** The selection the visible page answered; a newer selection leaves it on screen, stale. */
  const dataKey = signal('');
  let abort: AbortController | undefined;
  let revision = 0;
  let disposed = false;
  const key = () => JSON.stringify(selection());
  const enabled = () => active() && lifecycle() !== 'background' && !disposed;
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const groups = (): RankingChoices[] => {
    const values = selection();
    const root = ranks().find((option) =>
      values.rank === undefined ? option.selected : option.id === values.rank,
    );
    const result: RankingChoices[] = ranks().length
      ? [{ id: 'rank', dimension: 'rank', label: '榜单', options: ranks(), value: root?.id }]
      : [];
    if (!root) return result;
    const path = branch(root.children, values.rank_sub);
    const parents = [root, ...path];
    for (let index = 0; index < parents.length; index++) {
      const parent = parents[index];
      const source = JSON.stringify(parents.slice(0, index + 1).map((option) => option.id));
      if (parent.children.length)
        result.push({
          id: `sub:${source}`,
          dimension: 'rank_sub',
          label: parent.label,
          options: parent.children,
          value: path[index]?.id,
        });
      const panels = (owner: RankOption, ownerSource: string) => {
        for (const [panelIndex, panel] of owner.panels.entries()) {
          const panelSource = `${ownerSource}:${panel.type}:${panelIndex}`;
          const selectedPath = branch(panel.options, values.rank_panel, true);
          result.push({
            id: `panel:${panelSource}`,
            dimension: 'rank_panel',
            label: panel.label,
            options: panel.options,
            value: selectedPath[0]?.id,
          });
          for (let depth = 0; depth < selectedPath.length; depth++) {
            const option = selectedPath[depth];
            const optionSource = `${panelSource}:${JSON.stringify(selectedPath.slice(0, depth + 1).map((item) => item.id))}`;
            if (option.children.length)
              result.push({
                id: `panel:${optionSource}`,
                dimension: 'rank_panel',
                label: option.label,
                options: option.children,
                value: selectedPath[depth + 1]?.id,
              });
            panels(option, optionSource);
          }
        }
      };
      panels(parent, source);
    }
    return result;
  };
  const read = async (more = false) => {
    if (!enabled() || loading() || (more && !data()?.has_more)) return;
    const prior = more ? data() : undefined;
    const offset = prior?.next_offset ?? 0;
    if (more && (!Number.isInteger(offset) || offset < 1 || offset > 100000)) {
      error.set('榜单分页数据无效，请重新选择榜单。');
      return;
    }
    const owner = ++revision;
    const controller = new AbortController();
    abort = controller;
    const owns = () => owner === revision && !controller.signal.aborted && enabled();
    const params = new URLSearchParams();
    for (const [dimension, value] of Object.entries(selection()))
      if (value !== undefined) params.set(dimension, value);
    if (prior) {
      params.set('offset', String(offset));
      params.set('session_id', prior.session_id);
      const ids = prior.items.map((item) =>
        item.entry.kind === 'drama' ? item.entry.drama.series_id : item.entry.actor.id,
      );
      params.set('shown', [...new Set(ids.slice().reverse())].slice(0, 128).reverse().join(','));
    }
    const suffix = params.toString();
    const requestKey = key();
    loading.set(true);
    error.set('');
    try {
      const next = await request<RankResult>(
        `/api/v1/lists/rank${suffix ? `?${suffix}` : ''}`,
        controller.signal,
      );
      if (!owns()) return;
      if (
        !Array.isArray(next?.items) ||
        !Array.isArray(next.ranks) ||
        typeof next.has_more !== 'boolean' ||
        typeof next.session_id !== 'string' ||
        !Number.isInteger(next.next_offset) ||
        next.next_offset < 0 ||
        next.next_offset > 100000 ||
        (next.has_more && next.next_offset <= offset)
      )
        throw new Error('榜单数据无效，请重试。');
      const seen = new Set(prior?.items.map(rankingIdentity));
      const added = next.items.filter((item) => {
        const id = rankingIdentity(item);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      batch(() => {
        if (next.ranks.length) ranks.set(next.ranks);
        data.set({ ...next, items: [...(prior?.items ?? []), ...added] });
        dataKey.set(requestKey);
      });
    } catch (failure) {
      if (owns()) error.set(errorMessage(failure, '加载失败'));
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
    // A changed selection re-reads while the previous board stays visible; `dataKey` marks it.
    const behind = data() !== undefined && dataKey() !== key();
    if ((!data() || behind) && !loading() && !error()) void read();
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  return {
    selection,
    data,
    /** True while the visible board still answers an earlier selection. */
    stale: () => data() !== undefined && dataKey() !== key(),
    ranks,
    loading,
    error,
    selected,
    key,
    groups,
    change(groupId: string, value: string) {
      const group = groups().find((candidate) => candidate.id === groupId);
      if (
        !group?.options.some((option) => option.id === value) ||
        selection()[group.dimension] === value
      )
        return;
      const next = { ...selection(), [group.dimension]: value };
      if (group.dimension !== 'rank') {
        const root = groups().find((candidate) => candidate.dimension === 'rank')?.value;
        if (root !== undefined) next.rank = root;
      }
      if (group.dimension === 'rank_panel') {
        const sub = groups()
          .filter(
            (candidate) => candidate.dimension === 'rank_sub' && candidate.value !== undefined,
          )
          .at(-1)?.value;
        if (sub !== undefined) next.rank_sub = sub;
      }
      if (group.dimension === 'rank') {
        delete next.rank_sub;
        delete next.rank_panel;
      } else if (group.dimension === 'rank_sub') delete next.rank_panel;
      /** A new board is a different list, not a filtered one: it starts empty at the top. */
      const newBoard = group.dimension === 'rank';
      batch(() => {
        cancel();
        selection.set(next);
        // A sub-ranking or panel keeps the board that is already on screen and marks it stale;
        // switching the board itself drops it, because those rows belong to another list.
        if (newBoard) data.set(undefined);
        selected.set('');
        error.set('');
      });
    },
    retry() {
      void read(!!data());
    },
    loadMore() {
      void read(true);
    },
  };
}

export type RankingsController = ReturnType<typeof createRankings>;
