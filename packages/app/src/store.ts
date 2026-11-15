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
  CoreError,
  captureRequest,
  type Account,
  type AccountCommand,
  type AccountCommandResult,
  type GuestHistoryImportResult,
  type Drama,
  type Episode,
  type HistoryChange,
  type SearchResult,
  type SearchDiscovery,
} from '@hongguo/core-client';
import { createRecentSearches } from './recent-searches';
import { createLibraryState } from './library-state';
import { createFollowState } from './follow-state';
import { createReservationState } from './reservation-state';
import { createNotificationsState } from './notifications-state';
import { createSearchSuggestions } from './search-suggestions';
import { validateSearchInput } from './search-input';
import { createCategory } from './category';
import { errorMessage } from './error-messages';
import { createCalendar } from './calendar';
import { createRankings } from './rankings';
import { createRadar } from './radar';
import { isPlaybackCommand, type PlaybackCommand, type PlaybackCommandSource } from './playback';

// Native focus adapters report stable public IDs; undefined is a newer user navigation intent.
export type FocusSource = (receive: (id: string | undefined) => void) => () => void;

export type Section =
  | 'home'
  | 'feed'
  | 'discover'
  | 'search'
  | 'calendar'
  | 'rankings'
  | 'history'
  | 'following'
  | 'reservations'
  | 'notifications';
export type Route =
  | { name: 'browse' }
  | { name: 'detail'; drama: Drama }
  | { name: 'actor'; actorId: string; title: string }
  | { name: 'player'; drama: Drama; episode: Episode }
  | { name: 'account' }
  | { name: 'updates' };

/** One navigation stack and resource lifetime per mounted application. */
export function createStore(
  target: ProductTarget,
  subscribePlayerCommands?: PlaybackCommandSource,
  subscribeFocus?: FocusSource,
) {
  const request = captureRequest();
  const nav = createNavStack<Route>([{ name: 'browse' }]);
  const section = signal<Section>('home');
  const libraryKind = signal<'history' | 'favorites'>('history');
  const activePage = (name: Section) =>
    nav.routes().at(-1)?.name === 'browse' && section() === name;
  const playing = () =>
    nav.routes().at(-1)?.name === 'player' || (target === 'desktop' && activePage('feed'));
  const sources = new Map<number, () => void>();
  const primary = new Map<Section, ViewRef>();
  let frame = 0;
  let focusIntent = 0;
  let pendingPrimary: { name: Section; intent: number; epoch?: string } | undefined;
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
  let calendarBack: (() => boolean) | undefined;
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
  const calendar = createCalendar(request, () => activePage('calendar'));
  const rankingView = signal<'official' | 'radar'>('official');
  const rankings = createRankings(
    request,
    () => activePage('rankings') && rankingView() === 'official',
  );
  const radar = createRadar(request, () => activePage('rankings') && rankingView() === 'radar');
  const handleCalendarBack = () => activePage('calendar') && (calendarBack?.() ?? false);
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
        throw new CoreError('搜索分页数据无效，请重试。', 'SEARCH_PAGE_INVALID', 502);
      const seen = new Set(current.items.map((item) => item.series_id));
      const added = next.items.filter((item) => {
        if (seen.has(item.series_id)) return false;
        seen.add(item.series_id);
        return true;
      });
      continued.set({ ...next, items: [...current.items, ...added] });
    } catch (error) {
      if (owns()) {
        console.warn('搜索追加失败', error);
        moreError.set(errorMessage(error, '加载失败'));
      }
    } finally {
      if (owns()) {
        loadingMore.set(false);
        moreAbort = undefined;
      }
    }
  };
  let latestAccount: Account | undefined;
  const history = createLibraryState(request, () => latestAccount);
  const library = history.library;
  effect(() => history.setActive(lifecycle() === 'active'));
  let accountRevision = 0;
  const account = resource(async ({ signal }) => {
    const revision = accountRevision;
    try {
      const next = await request<Account>('/api/v1/account', signal);
      if (revision !== accountRevision && latestAccount) return latestAccount;
      latestAccount = next;
      return next;
    } catch (cause) {
      if (revision !== accountRevision && latestAccount) return latestAccount;
      throw cause;
    }
  });
  const publishAccount = (next: Account) => {
    accountRevision++;
    latestAccount = next;
    account.mutate(next);
  };
  const follow = createFollowState(
    request,
    account,
    () =>
      lifecycle() === 'active' &&
      (activePage('following') || nav.routes().at(-1)?.name === 'detail'),
  );
  const reservationDetailActive = signal(false);
  const reservationDetails = new Set<object>();
  const reservations = createReservationState(
    request,
    account,
    () =>
      lifecycle() === 'active' &&
      (activePage('reservations') ||
        activePage('calendar') ||
        (nav.routes().at(-1)?.name === 'detail' && reservationDetailActive())),
  );
  const notifications = createNotificationsState(
    request,
    account,
    () => lifecycle() === 'active' && activePage('notifications'),
  );
  let accountTail = Promise.resolve();
  const cancelledAccountCommand = () => new CoreError('账号操作已取消。', 'CORE_CANCELLED', 499);
  const accountCommandResult = (
    command: AccountCommand,
    abort?: AbortSignal,
    allowReconciled = false,
  ): Promise<AccountCommandResult> => {
    const scope = {
      owner_id: latestAccount?.owner_id ?? library()?.owner_id ?? '',
      owner_epoch: latestAccount?.owner_epoch ?? '',
    };
    const admittedRevision = accountRevision;
    // Cancellation must reach the core while a login command is still awaiting its response.
    if (command.action === 'cancel')
      return request<AccountCommandResult>('/api/v1/account/command', undefined, {
        ...scope,
        command,
      })
        .catch(async (cause) => {
          if (
            !(cause instanceof CoreError) ||
            !['ACCOUNT_OWNER_CHANGED', 'ACCOUNT_ATTEMPT_EXPIRED'].includes(cause.code)
          )
            throw cause;
          // Completion may have won cancellation; observe it instead of claiming rollback.
          return request<AccountCommandResult>('/api/v1/account/state');
        })
        .then((result) => {
          if (
            admittedRevision === accountRevision &&
            result.account.owner_epoch === scope.owner_epoch &&
            result.account.owner_id === (library()?.owner_id ?? '')
          )
            publishAccount(result.account);
          return result;
        });
    const run = async () => {
      if (abort?.aborted) throw cancelledAccountCommand();
      let result: AccountCommandResult | undefined;
      if (history.ownerBlocked()) {
        await history.transitionOwner(
          async () => {
            result = await request<AccountCommandResult>('/api/v1/account/state');
            if (result.account.owner_id !== (result.library.owner_id ?? ''))
              throw new CoreError(
                '账号与观看记录不一致，请重新读取。',
                'ACCOUNT_OWNER_CHANGED',
                409,
              );
            return result.library;
          },
          () => publishAccount(result!.account),
        );
      }
      if (abort?.aborted) throw cancelledAccountCommand();
      playerCommand?.('pause');
      playerCheckpoint?.();
      let failure: unknown;
      await history.transitionOwner(
        async () => {
          try {
            if (abort?.aborted) throw cancelledAccountCommand();
            result = await request<AccountCommandResult>('/api/v1/account/command', abort, {
              ...scope,
              command,
            });
            // An aborted response cannot authorize publication; reread the core instead.
            if (abort?.aborted) throw cancelledAccountCommand();
          } catch (cause) {
            failure = cause;
            result = await request<AccountCommandResult>('/api/v1/account/state');
          }
          if (result.account.owner_id !== (result.library.owner_id ?? ''))
            throw new CoreError('账号与观看记录不一致，请重新读取。', 'ACCOUNT_OWNER_CHANGED', 409);
          return result.library;
        },
        () => publishAccount(result!.account),
      );
      const uncertainDelivery =
        !(failure instanceof CoreError) ||
        ['CORE_CANCELLED', 'CORE_RESPONSE_INVALID'].includes(failure.code);
      if (failure && (!allowReconciled || !uncertainDelivery)) throw failure;
      // The state endpoint never supplies a command receipt or reconstructed import counts.
      return failure ? { account: result!.account, library: result!.library } : result!;
    };
    const pending = accountTail.then(run);
    accountTail = pending.then(
      () => {},
      () => {},
    );
    return pending;
  };
  const accountCommand = (command: AccountCommand, abort?: AbortSignal): Promise<Account> =>
    accountCommandResult(command, abort).then((result) => result.account);
  const refreshAccountLibraryState = (shouldRun: () => boolean = () => true) => {
    const run = async () => {
      if (!shouldRun()) return;
      let result: AccountCommandResult;
      const recovering = history.ownerBlocked();
      const scope = latestAccount;
      const read = async (abort?: AbortSignal) => {
        if (!shouldRun()) throw cancelledAccountCommand();
        result = await request<AccountCommandResult>('/api/v1/account/state', abort);
        if (
          result.account.owner_id !== (result.library.owner_id ?? '') ||
          (!recovering &&
            scope &&
            (result.account.owner_id !== scope.owner_id ||
              result.account.owner_epoch !== scope.owner_epoch))
        )
          throw new CoreError('账号与观看记录不一致，请重新读取。', 'ACCOUNT_OWNER_CHANGED', 409);
        return result.library;
      };
      const publish = () => publishAccount(result.account);
      if (recovering) await history.transitionOwner(read, publish);
      else await history.observe(read, publish, shouldRun);
    };
    const pending = accountTail.then(run);
    accountTail = pending.then(
      () => {},
      () => {},
    );
    return pending;
  };
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
  const warning = history.warning;
  const restoreFocus = () => {
    const owned = focusIntent;
    pendingPrimary = undefined;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (owned !== focusIntent) return;
        const source = sources.get(nav.routes().length);
        if (source) source();
        else if (nav.routes().length === 1) {
          pendingPrimary = { name: section(), intent: owned, epoch: account()?.owner_epoch };
          primary.get(section())?.focus();
        }
      });
    });
  };
  return {
    target,
    historyManagement: history.management,
    favoritesManagement: history.favoritesManagement,
    favoriteOperation: history.favoriteOperation,
    follow,
    reservations,
    notifications,
    reservationDetailActive(owner: object, value: boolean) {
      if (value) reservationDetails.add(owner);
      else reservationDetails.delete(owner);
      reservationDetailActive.set(reservationDetails.size > 0);
    },
    retryFavorite: history.retryFavorite,
    hostFocus,
    hostOwnsFocus: !!subscribeFocus,
    nav,
    section,
    libraryKind,
    openLibrary(kind: 'history' | 'favorites') {
      libraryKind.set(kind);
      navigate('history');
    },
    activePage,
    playing,
    request,
    navigate,
    handleCalendarBack,
    back() {
      if (handleCalendarBack()) return;
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
    async shutdown() {
      follow.dispose();
      reservations.dispose();
      notifications.dispose();
      const finish = history.beginShutdown(() => playerCheckpoint?.());
      try {
        await recent.drain();
        await history.drain();
      } finally {
        finish();
      }
    },
    async prepareUpdate() {
      playerCommand?.('pause');
      playerCheckpoint?.();
      await history.drain();
      // Retry inside the same queue; an update cannot bypass uncommitted progress.
      await history.retryFailed();
      await recent.drain();
      await history.drain();
      history.assertSaved();
    },
    registerPlayerBack(handler: () => void) {
      playerBack = handler;
      return () => {
        if (playerBack === handler) playerBack = undefined;
      };
    },
    /** The mounted calendar owns local dismissal; stale cleanup cannot remove its replacement. */
    registerCalendarBack(handler: () => boolean) {
      calendarBack = handler;
      return () => {
        if (calendarBack === handler) calendarBack = undefined;
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
    calendar,
    rankings,
    rankingView,
    radar,
    selectRankingView(view: 'official' | 'radar') {
      if (rankingView() === view) return;
      sources.delete(nav.routes().length);
      rankingView.set(view);
    },
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
    primaryReady(name: Section) {
      const plan = pendingPrimary;
      if (!plan || plan.name !== name) return;
      pendingPrimary = undefined;
      if (
        plan.intent === focusIntent &&
        plan.epoch === account()?.owner_epoch &&
        activePage(name) &&
        lifecycle() === 'active'
      )
        primary.get(name)?.focus();
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
    openUpdates(restore: () => void) {
      sources.set(nav.routes().length, restore);
      nav.push({ name: 'updates' });
    },
    accountPage(restore?: () => void) {
      account.refetch();
      if (restore) sources.set(nav.routes().length, restore);
      nav.push({ name: 'account' });
    },
    draft,
    query,
    results,
    library,
    account,
    accountCommand,
    async importGuestHistory(): Promise<GuestHistoryImportResult | undefined> {
      const result = await accountCommandResult(
        { action: 'import_guest_history' },
        undefined,
        true,
      );
      return result.import_history;
    },
    refreshAccountLibraryState,
    /** Read-only observation after core sync; does not run cloud work. */
    async refreshLibraryState() {
      await library.refetch();
      await account.refetch();
    },
    favorites: () =>
      (library()?.favorites ?? []).slice().sort((a, b) => b.favorite_at - a.favorite_at),
    isFavorite: (drama: Drama) =>
      library()?.favorites.some((entry) => entry.drama.series_id === drama.series_id) ?? false,
    setFavorite(drama: Drama, value: boolean) {
      return history.favorite({
        action: 'favorite',
        owner_id: library()?.owner_id ?? '',
        drama: libraryDrama(drama),
        value,
      });
    },
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
      return history.save(change);
    },
  };
}
export type Store = ReturnType<typeof createStore>;
