import { cleanup, resource, signal, type ViewRef } from 'nsh';
import type { ProductTarget } from '@hongguo/ui';
import { createNavStack } from 'nsh/base';
import {
  libraryDrama,
  request,
  search,
  type Account,
  type Drama,
  type Episode,
  type HistoryChange,
  type Library,
} from '@hongguo/core-client';
import { isPlaybackCommand, type PlaybackCommand, type PlaybackCommandSource } from './playback';

export type Section = 'home' | 'search' | 'history';
export type Route =
  | { name: 'browse' }
  | { name: 'detail'; drama: Drama }
  | { name: 'player'; drama: Drama; episode: Episode }
  | { name: 'account' };

/** One navigation stack and resource lifetime per mounted application. */
export function createStore(
  target: ProductTarget,
  subscribePlayerCommands?: PlaybackCommandSource,
) {
  const nav = createNavStack<Route>([{ name: 'browse' }]);
  const section = signal<Section>('home');
  const activePage = (name: Section) =>
    nav.routes().at(-1)?.name === 'browse' && section() === name;
  const sources = new Map<number, () => void>();
  const primary = new Map<Section, ViewRef>();
  let frame = 0;
  let playerBack: (() => void) | undefined;
  let playerCommand: ((command: PlaybackCommand) => void) | undefined;
  // Listen for the app lifetime so a command on a browse page cannot queue for a future player.
  if (subscribePlayerCommands)
    cleanup(
      subscribePlayerCommands((command) => {
        if (nav.routes().at(-1)?.name === 'player' && isPlaybackCommand(command))
          playerCommand?.(command);
      }),
    );
  cleanup(() => cancelAnimationFrame(frame));
  const searchSelection = signal('');
  const draft = signal('');
  const query = signal('');
  const results = resource(
    () => query() || undefined,
    (q, { signal }) => search(q, signal),
  );
  const library = resource(({ signal }) => request<Library>('/api/v1/library', signal));
  const account = resource(({ signal }) => request<Account>('/api/v1/account', signal));
  const entries = () =>
    (library()?.entries ?? [])
      .filter((entry) => entry.last_played_at)
      .slice()
      .sort((a, b) => b.last_played_at! - a.last_played_at!);
  const navigate = (next: Section) => {
    nav.popToRoot();
    section.set(next);
    sources.clear();
    if (next === 'history') library.refetch();
  };
  const warning = signal('');
  let writes = Promise.resolve();
  return {
    target,
    nav,
    section,
    activePage,
    navigate,
    back() {
      if (nav.routes().at(-1)?.name === 'player' && playerBack) playerBack();
      else if (nav.routes().length > 1) nav.pop();
      else navigate('home');
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
    catalog: results,
    entries,
    focusPrimary() {
      primary.get(section())?.focus();
    },
    primaryRef(name: Section, ref: ViewRef) {
      primary.set(name, ref);
    },
    restoreFocus() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          const source = sources.get(nav.routes().length);
          if (source) source();
          else if (nav.routes().length === 1) primary.get(section())?.focus();
        });
      });
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
      const q = draft().trim();
      if (!q) return;
      navigate('search');
      searchSelection.set('');
      if (q === query()) results.refetch();
      else query.set(q);
    },
    open(drama: Drama, origin?: () => void) {
      if (origin) sources.set(nav.routes().length, origin);
      nav.push({ name: 'detail', drama });
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
