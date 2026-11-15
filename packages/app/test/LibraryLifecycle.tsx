import { cleanup, effect, signal, Text, untracked, View } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type HistoryChange, type Library } from '@hongguo/core-client';
import { createStore, type Store } from '../src/store';

/** Retained diagnostics around real store owners; synthetic writes require explicit completion. */
export function LibraryLifecycleFixture() {
  const mounted = signal<'old' | 'new' | ''>('old');
  const oldReady = signal(false);
  const events = signal<string[]>([]);
  const drama = { series_id: '123', title: '生命周期回归', cover: '', intro: '' };
  const episode = { index: 1, video_id: '456', locked: false };
  const persisted = signal<Library>({
    owner_id: '',
    favorites: [],
    entries: [
      { drama, episode: 1, video_id: '456', position: 10, duration: 60, last_played_at: 1 },
    ],
  });
  const pending: { owner: string; complete: () => void }[] = [];
  const sessions = new Map<string, { owner: string; receipts: Map<string, unknown> }>();
  let sessionCount = 0;
  let oldStore: Store | undefined;
  let clearOnMount = false;
  const record = (event: string) => events.update((all) => [...all, event]);
  const snapshot = () => JSON.parse(JSON.stringify(persisted())) as Library;
  const transport = (owner: 'old' | 'new') => {
    configureTransport({
      mediaOrigin: 'http://127.0.0.1:18765',
      request(path, _abort, body) {
        if (path === '/api/v1/library' && body === undefined) return Promise.resolve(snapshot());
        if (path === '/api/v1/library/session') {
          const session = (++sessionCount).toString(16).padStart(32, '0');
          sessions.set(session, { owner, receipts: new Map() });
          record(`${owner}-session`);
          return Promise.resolve({ session_id: session });
        }
        if (path.startsWith('/api/v1/library/operation?')) {
          const url = new URL(path, 'http://fixture');
          const session = url.searchParams.get('session_id') ?? '';
          const operation = url.searchParams.get('operation_id') ?? '';
          const owned = sessions.get(session);
          if (!owned || owned.owner !== owner)
            return Promise.reject(new Error('Unknown fixture session'));
          if (owned.receipts.has(operation)) return Promise.resolve(owned.receipts.get(operation));
          const change = JSON.parse(JSON.stringify(body)) as HistoryChange;
          if (
            change.action !== 'progress' &&
            change.action !== 'remove' &&
            change.action !== 'clear'
          )
            return Promise.reject(new Error('Unexpected fixture history action'));
          record(
            `${owner}-write-${change.action === 'progress' ? change.position : change.action}`,
          );
          return new Promise((resolve) => {
            pending.push({
              owner,
              complete() {
                if (change.action === 'progress')
                  persisted.set({
                    owner_id: '',
                    favorites: [],
                    entries: [
                      {
                        drama: change.drama,
                        episode: change.episode,
                        video_id: change.video_id,
                        position: change.position,
                        duration: change.duration,
                        completed: change.completed,
                        last_played_at: 10 + sessionCount,
                      },
                    ],
                  });
                else
                  persisted.set({
                    owner_id: '',
                    favorites: [],
                    entries:
                      change.action === 'clear'
                        ? []
                        : persisted().entries.filter(
                            (entry) => entry.drama.series_id !== change.series_id,
                          ),
                  });
                const receipt = {
                  session_id: session,
                  operation_id: operation,
                  outcome: { status: 'committed', library: snapshot() },
                };
                owned.receipts.set(operation, receipt);
                record(
                  `${owner}-committed-${change.action === 'progress' ? change.position : change.action}`,
                );
                resolve(receipt);
              },
            });
          });
        }
        return Promise.resolve({
          items: [],
          favorites: [],
          entries: [],
          logged_in: false,
          sync: { state: 'local', pending: 0 },
        });
      },
    });
  };
  const save = (store: Store, position: number) => store.save(drama, episode, position, 60);
  const close = (store: Store) => {
    void store.shutdown().then(
      () => record('old-drained'),
      () => record('old-drain-failed'),
    );
  };
  const finish = (owner: string) => {
    const index = pending.findIndex((entry) => entry.owner === owner);
    if (index >= 0) pending.splice(index, 1)[0]!.complete();
  };
  function Owner(props: { id: 'old' | 'new' }) {
    const id = props.id;
    const store = createStore('desktop');
    if (id === 'old') oldStore = store;
    store.registerPlayerCheckpoint(() => {
      record(`${id}-checkpoint`);
      void save(store, 5);
    });
    let ready = false;
    effect(() => {
      if (ready || store.library.state() !== 'ready') return;
      ready = true;
      untracked(() => {
        if (id === 'old') oldReady.set(true);
        if (id === 'new' && clearOnMount)
          void store.historyManagement.clear().then(() => record('new-cleared'));
      });
    });
    cleanup(() => record(`${id}-unmounted`));
    return <Text>{`${id}-mounted`}</Text>;
  }
  transport('old');
  const count = (prefix: string) => events().filter((event) => event.startsWith(prefix)).length;
  return (
    <View class="flex-1 bg-background gap-2 p-4">
      <View class="flex-row flex-wrap gap-2">
        <Button
          label="丢弃旧宿主"
          onPress={() => {
            if (!oldStore) return;
            void save(oldStore, 20);
            mounted.set('');
          }}
        />
        <Button
          label="排空旧宿主"
          onPress={() => {
            if (!oldStore) return;
            void save(oldStore, 1);
            close(oldStore);
            mounted.set('');
          }}
        />
        <Button
          label="接管并清空"
          onPress={() => {
            if (!oldStore) return;
            void save(oldStore, 20);
            close(oldStore);
            mounted.set('');
            clearOnMount = true;
            transport('new');
            mounted.set('new');
          }}
        />
        <Button label="完成旧写入" onPress={() => finish('old')} />
        <Button label="完成新写入" onPress={() => finish('new')} />
      </View>
      <Text>{`old-ready:${oldReady()}`}</Text>
      <Text>{`old-sessions:${count('old-session')}`}</Text>
      <Text>{`old-writes:${count('old-write-')}`}</Text>
      <Text>{`new-sessions:${count('new-session')}`}</Text>
      <Text>{`persisted:${persisted().entries[0]?.position ?? 'none'}`}</Text>
      <Text>{events().join('|')}</Text>
      <If when={mounted() === 'old'}>{() => <Owner id="old" />}</If>
      <If when={mounted() === 'new'}>{() => <Owner id="new" />}</If>
    </View>
  );
}
