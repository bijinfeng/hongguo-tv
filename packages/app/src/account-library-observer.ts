import { cleanup, effect, lifecycle } from 'nsh';
import type { Store } from './store';

/** Observe Rust state only while this surface owns the visible account scope. */
export function observeAccountLibraryState(store: Store, active: () => boolean) {
  const scope = () => JSON.stringify([store.account()?.owner_id, store.account()?.owner_epoch]);
  let current = '';
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  effect(() => {
    const next = active() && lifecycle() === 'active' && store.account()?.logged_in ? scope() : '';
    if (next === current) return;
    stop();
    current = next;
    if (!next) return;
    const owned = generation;
    const owns = () =>
      !disposed &&
      owned === generation &&
      active() &&
      lifecycle() === 'active' &&
      store.account()?.logged_in === true &&
      scope() === next;
    const refresh = async () => {
      try {
        await store.refreshAccountLibraryState(owns);
      } catch {
        // Failed observations retain readable records; explicit actions own recovery feedback.
      }
      if (owns()) {
        const sync = store.account()?.sync;
        const pending = sync?.state === 'syncing' || sync?.state === 'pending';
        timer = setTimeout(() => void refresh(), pending ? 2000 : 15000);
      }
    };
    timer = setTimeout(() => void refresh(), 1000);
  });
  cleanup(() => {
    disposed = true;
    stop();
  });
}
