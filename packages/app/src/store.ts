import { resource, signal } from 'nsh';
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

export type Route =
  | { name: 'search' }
  | { name: 'detail'; drama: Drama }
  | { name: 'player'; drama: Drama; episode: Episode }
  | { name: 'history' }
  | { name: 'account' };
export const nav = createNavStack<Route>([{ name: 'search' }]);
export const activePage = (name: Route['name']) => nav.routes().at(-1)?.name === name;
export function createStore() {
  const draft = signal('');
  const query = signal('');
  const results = resource(
    () => query() || undefined,
    (q, { signal }) => search(q, signal),
  );
  const library = resource(({ signal }) => request<Library>('/api/v1/library', signal));
  const account = resource(({ signal }) => request<Account>('/api/v1/account', signal));
  const warning = signal('');
  let writes = Promise.resolve();
  return {
    draft,
    query,
    results,
    library,
    account,
    warning,
    submit() {
      const q = draft().trim();
      if (q === query()) results.refetch();
      else query.set(q);
    },
    open(drama: Drama) {
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
