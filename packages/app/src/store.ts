import {
  batch,
  cleanup,
  effect,
  lifecycle,
  resource,
  signal,
  type InputRef,
  type ViewRef,
} from 'nsh';
import type { ProductTarget } from '@hongguo/ui';
import { createNavStack } from 'nsh/base';
import {
  libraryDrama,
  captureRequest,
  type Account,
  type Drama,
  type Episode,
  type HistoryChange,
  type Library,
  type SearchResult,
  type SearchDiscovery,
} from '@hongguo/core-client';
import { createRecentSearches } from './recent-searches';
import { createSearchSuggestions } from './search-suggestions';
import { validateSearchInput } from './search-input';
import { createCategory } from './category';
import { isPlaybackCommand, type PlaybackCommand, type PlaybackCommandSource } from './playback';

// Native focus adapters report stable public IDs; undefined is a newer user navigation intent.
export type FocusSource = (receive: (id: string | undefined) => void) => () => void;

export type Section = 'home' | 'feed' | 'discover' | 'search' | 'history';
export type Route =
  | { name: 'browse' }
  | { name: 'detail'; drama: Drama }
  | { name: 'actor'; actorId: string; title: string }
  | { name: 'player'; drama: Drama; episode: Episode }
  | { name: 'account' };

/** One navigation stack and resource lifetime per mounted application. */
export function createStore(
  target: ProductTarget,
  subscribePlayerCommands?: PlaybackCommandSource,
  subscribeFocus?: FocusSource,
) {
  const request = captureRequest();
  const nav = createNavStack<Route>([{ name: 'browse' }]);
  const section = signal<Section>('home');
  const activePage = (name: Section) =>
    nav.routes().at(-1)?.name === 'browse' && section() === name;
  const playing = () =>
    nav.routes().at(-1)?.name === 'player' || (target === 'desktop' && activePage('feed'));
  const sources = new Map<number, () => void>();
  const primary = new Map<Section, ViewRef>();
  let frame = 0;
  let focusIntent = 0;
  const hostFocus = signal('');
  if (subscribeFocus)
    cleanup(
      subscribeFocus((id) => {
        if (id === undefined) focusIntent++;
        else hostFocus.set(id);
      }),
    );
  let searchInput: InputRef | undefined;
  let playerCheckpoint: (() => void) | undefined;
  let playerBack: (() => void) | undefined;
  let playerCommand: ((command: PlaybackCommand) => void) | undefined;
  // Listen for the app lifetime so a command on a browse page cannot queue for a future player.
  if (subscribePlayerCommands)
    cleanup(
      subscribePlayerCommands((command) => {
        if (playing() && isPlaybackCommand(command)) playerCommand?.(command);
      }),
    );
  cleanup(() => cancelAnimationFrame(frame));
  const searchSelection = signal('');
  const category = createCategory(request, () => activePage('discover'));
  let searchSource: Section = 'home';
  let categorySource: { restore: () => void; key: string } | undefined;
  let searchReturn: (() => void) | undefined;
  const draft = signal('');
  const query = signal('');
  const continued = signal<SearchResult | undefined>(undefined);
  const loadingMore = signal(false);
  const moreError = signal('');
  let searchRevision = 0;
  let moreAbort: AbortController | undefined;
  const resetContinuation = () => {
    searchRevision++;
    moreAbort?.abort();
    moreAbort = undefined;
    continued.set(undefined);
    loadingMore.set(false);
    moreError.set('');
  };
  cleanup(resetContinuation);
  const results = resource(
    () => query() || undefined,
    (q, { signal }) => {
      resetContinuation();
      return request<SearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}&source=web`, signal);
    },
  );
  const catalog = () => continued() ?? results();
  const loadMore = async () => {
    const current = catalog();
    if (!current?.has_more || results.state() !== 'ready' || loadingMore()) return;
    const offset = current.next_offset;
    if (
      (current.source !== undefined && current.source !== 'web') ||
      !Number.isInteger(offset) ||
      offset < 1 ||
      offset > 100000
    ) {
      moreError.set('搜索分页数据无效，请重新搜索。');
      return;
    }
    const revision = searchRevision;
    const term = query();
    const abort = new AbortController();
    moreAbort = abort;
    const owns = () => revision === searchRevision && term === query() && !abort.signal.aborted;
    loadingMore.set(true);
    moreError.set('');
    try {
      const next = await request<SearchResult>(
        `/api/v1/search?q=${encodeURIComponent(term)}&offset=${offset}&source=web`,
        abort.signal,
      );
      if (!owns()) return;
      if (
        !Array.isArray(next?.items) ||
        typeof next.has_more !== 'boolean' ||
        (next.source !== undefined && next.source !== 'web') ||
        !Number.isInteger(next.next_offset) ||
        next.next_offset <= offset ||
        next.next_offset > 100001
      )
        throw new Error('搜索分页数据无效，请重试。');
      const seen = new Set(current.items.map((item) => item.series_id));
      const added = next.items.filter((item) => {
        if (seen.has(item.series_id)) return false;
        seen.add(item.series_id);
        return true;
      });
      continued.set({ ...next, items: [...current.items, ...added] });
    } catch (error) {
      if (owns())
        moreError.set(`加载失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (owns()) {
        loadingMore.set(false);
        moreAbort = undefined;
      }
    }
  };
  const library = resource(({ signal }) => request<Library>('/api/v1/library', signal));
  const account = resource(({ signal }) => request<Account>('/api/v1/account', signal));
  const entries = () =>
    (library()?.entries ?? [])
      .filter((entry) => entry.last_played_at)
      .slice()
      .sort((a, b) => b.last_played_at! - a.last_played_at!);
  const navigate = (next: Section) => {
    suggestions.dismiss();
    batch(() => {
      if (nav.routes().length > 1) nav.popToRoot();
      section.set(next);
    });
    sources.clear();
    if (next === 'history') library.refetch();
  };
  const discoverySnapshot = signal<SearchDiscovery | undefined>(undefined);
  const discovery = resource(
    () => (activePage('search') && !query() ? 'public' : undefined),
    (_, { signal }) => request<SearchDiscovery>('/api/v1/search/discovery', signal),
  );
  effect(() => {
    const data = discovery();
    if (data) discoverySnapshot.set(data);
  });
  const discoveryData = () => discovery() ?? discoverySnapshot();
  const recent = createRecentSearches(request, () => activePage('search') && !query());
  const suggestions = createSearchSuggestions(
    request,
    draft,
    () =>
      nav.routes().at(-1)?.name === 'browse' &&
      (target === 'desktop' || section() === 'search') &&
      lifecycle() === 'active',
  );
  const searchFailure = signal<{ raw: string; message: string } | undefined>(undefined);
  const searchError = () => (searchFailure()?.raw === draft() ? searchFailure()!.message : '');
  const warning = signal('');
  let writes = Promise.resolve();
  const restoreFocus = () => {
    const owned = focusIntent;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (owned !== focusIntent) return;
        const source = sources.get(nav.routes().length);
        if (source) source();
        else if (nav.routes().length === 1) primary.get(section())?.focus();
      });
    });
  };
  return {
    target,
    hostFocus,
    hostOwnsFocus: !!subscribeFocus,
    nav,
    section,
    activePage,
    playing,
    request,
    navigate,
    back() {
      if (playing() && playerBack) playerBack();
      else if (nav.routes().length > 1) nav.pop();
      else if (section() === 'search' && searchSource === 'discover') {
        navigate('discover');
        if (searchReturn) sources.set(1, searchReturn);
        restoreFocus();
      } else {
        navigate('home');
        restoreFocus();
      }
    },
    registerPlayerCheckpoint(handler: () => void) {
      playerCheckpoint = handler;
      return () => {
        if (playerCheckpoint === handler) playerCheckpoint = undefined;
      };
    },
    shutdown() {
      playerCheckpoint?.();
      return Promise.all([writes, recent.drain()]).then(() => {});
    },
    registerPlayerBack(handler: () => void) {
      playerBack = handler;
      return () => {
        if (playerBack === handler) playerBack = undefined;
      };
    },
    registerPlayerCommand(handler: (command: PlaybackCommand) => void) {
      playerCommand = handler;
      return () => {
        if (playerCommand === handler) playerCommand = undefined;
      };
    },
    searchSelection,
    category,
    searchFromCategory: () => section() === 'search' && searchSource === 'discover',
    categorySource(restore: () => void) {
      categorySource = { restore, key: category.key() };
    },
    openSearch() {
      if (section() !== 'search') {
        searchSource = section();
        searchReturn =
          section() === 'discover' && categorySource?.key === category.key()
            ? categorySource.restore
            : undefined;
      }
      navigate('search');
      searchInput?.focus();
    },
    discovery,
    discoveryData,
    recent,
    suggestions,
    searchError,
    clearQuery() {
      suggestions.dismiss();
      resetContinuation();
      query.set('');
      draft.set('');
      searchSelection.set('');
      searchInput?.focus();
    },
    searchInputRef(ref: InputRef) {
      searchInput = ref;
    },
    focusSearchInput() {
      searchInput?.focus();
    },
    catalog,
    loadMore,
    loadingMore,
    moreError,
    entries,
    focusPrimary() {
      primary.get(section())?.focus();
    },
    primaryRef(name: Section, ref: ViewRef) {
      primary.set(name, ref);
    },
    noteFocusIntent() {
      focusIntent++;
    },
    focusGuard() {
      const owned = focusIntent;
      return () => owned === focusIntent;
    },
    restoreFocus,
    rememberSource(restore: () => void) {
      sources.set(nav.routes().length, restore);
    },
    play(drama: Drama, episode: Episode, origin?: ViewRef) {
      if (origin) sources.set(nav.routes().length, () => origin.focus());
      nav.push({ name: 'player', drama, episode });
    },
    accountPage() {
      account.refetch();
      nav.push({ name: 'account' });
    },
    draft,
    query,
    results,
    library,
    account,
    warning,
    submit() {
      if (suggestions.composing()) return false;
      const { query: q, error } = validateSearchInput(draft());
      searchFailure.set({ raw: draft(), message: error });
      if (!q) {
        if (error) {
          suggestions.dismiss();
          searchInput?.focus();
        }
        return false;
      }
      batch(() => {
        if (section() !== 'search') {
          searchSource = section();
          searchReturn =
            section() === 'discover' && categorySource?.key === category.key()
              ? categorySource.restore
              : undefined;
        }
        navigate('search');
        searchSelection.set('');
        if (q === query()) results.refetch();
        else query.set(q);
      });
      void recent.add(q);
      return true;
    },
    open(drama: Drama, origin?: () => void) {
      suggestions.dismiss();
      if (origin) sources.set(nav.routes().length, origin);
      nav.push({ name: 'detail', drama });
    },
    openActor(actorId: string, title: string, origin?: () => void) {
      suggestions.dismiss();
      if (origin) sources.set(nav.routes().length, origin);
      nav.push({ name: 'actor', actorId, title });
    },
    resume(drama: Drama) {
      return library()?.entries.find((e) => e.drama.series_id === drama.series_id);
    },
    save(drama: Drama, episode: Episode, position: number, duration: number, completed = false) {
      const owner = library()?.owner_id ?? '';
      const change: HistoryChange = {
        action: 'progress',
        owner_id: owner,
        drama: libraryDrama(drama),
        episode: episode.index,
        video_id: episode.video_id,
        position,
        duration,
        completed,
      };
      writes = writes.then(async () => {
        try {
          const next = await request<Library>('/api/v1/library', undefined, change);
          if ((library()?.owner_id ?? '') === owner) library.mutate(next);
          warning.set('');
        } catch (error) {
          warning.set(`观看进度未保存：${String(error)}`);
        }
      });
      return writes;
    },
  };
}
export type Store = ReturnType<typeof createStore>;
