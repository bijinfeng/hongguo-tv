import { Text, View, signal } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type HistoryChange, type Library } from '@hongguo/core-client';
import { createStore } from '../src/store';

/** Deferred synthetic responses deliberately ignore abort to test publication ownership. */
export function LibraryStateFixture() {
  const events = signal<string[]>([]);
  const changes = signal<string[]>([]);
  const completion = signal('idle');
  const drama = { series_id: '123', title: '状态边界', cover: '', intro: '' };
  let persisted: Library = {
    owner_id: '',
    favorites: [],
    entries: [
      { drama, episode: 1, video_id: '456', position: 10, duration: 100, last_played_at: 1 },
    ],
  };
  const reads: { finish: (owner?: string) => void; fail: () => void }[] = [];
  let write: ((fail?: boolean | 'lost' | 'lost-failure') => void) | undefined;
  let readCount = 0;
  let writeCount = 0;
  let inFlight = 0;
  const sessionId = 'a'.repeat(32);
  const receipts = new Map<string, unknown>();
  const log = (value: string) => events.update((items) => [...items, value]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort, body) {
      if (path === '/api/v1/library/session') return Promise.resolve({ session_id: sessionId });
      const operation = path.startsWith('/api/v1/library/operation?');
      if (operation && receipts.has(path)) {
        log('replay');
        return Promise.resolve(receipts.get(path));
      }
      if (path !== '/api/v1/library' && !operation)
        return Promise.resolve({
          items: [],
          favorites: [],
          entries: [],
          logged_in: false,
          sync: { state: 'local', pending: 0 },
        });
      if (!body) {
        const snapshot = persisted;
        const number = ++readCount;
        log(`read-${number}`);
        abort?.addEventListener('abort', () => log(`abort-${number}`));
        return new Promise((resolve, reject) => {
          reads.push({
            finish: (owner) => resolve({ ...snapshot, owner_id: owner ?? snapshot.owner_id }),
            fail: () => reject(new Error('合成读取失败')),
          });
        });
      }
      const change = body as HistoryChange;
      if (change.action !== 'progress' && change.action !== 'remove' && change.action !== 'clear')
        return Promise.reject(new Error('Unexpected fixture history action'));
      changes.update((items) => [
        ...items,
        change.action === 'progress'
          ? `progress-${change.drama.series_id}-${change.position}`
          : change.action === 'remove'
            ? `remove-${change.series_id}`
            : 'clear',
      ]);
      log(`write-${++writeCount}-${++inFlight}`);
      return new Promise((resolve, reject) => {
        write = (fail) => {
          inFlight--;
          if (fail === true || fail === 'lost-failure') {
            const receipt = {
              session_id: sessionId,
              operation_id: new URL(path, 'http://fixture').searchParams.get('operation_id'),
              outcome: {
                status: 'failed',
                code: 'LIBRARY_STORAGE_UNAVAILABLE',
                error: '合成保存失败',
              },
            };
            receipts.set(path, receipt);
            if (fail === 'lost-failure') reject(new Error('合成失败终态回执丢失'));
            else resolve(receipt);
            return;
          }
          if (change.action === 'progress')
            persisted = {
              owner_id: '',
              favorites: [],
              entries: [
                { ...change, drama: change.drama, last_played_at: writeCount + 10 },
                ...persisted.entries.filter(
                  (entry) => entry.drama.series_id !== change.drama.series_id,
                ),
              ],
            };
          else
            persisted = {
              owner_id: '',
              favorites: [],
              entries:
                change.action === 'clear'
                  ? []
                  : persisted.entries.filter((entry) => entry.drama.series_id !== change.series_id),
            };
          const receipt = {
            session_id: sessionId,
            operation_id: new URL(path, 'http://fixture').searchParams.get('operation_id'),
            outcome: { status: 'committed', library: persisted },
          };
          receipts.set(path, receipt);
          if (fail === 'lost') reject(new Error('合成响应丢失：存储已提交'));
          else resolve(receipt);
        };
      });
    },
  });
  const store = createStore('desktop');
  const save = (position: number) =>
    store.save(drama, { index: 1, video_id: '456', locked: false }, position, 100);
  const settleWrite = (fail?: boolean | 'lost' | 'lost-failure') => {
    const current = write;
    write = undefined;
    current?.(fail);
  };
  return (
    <View class="flex-row gap-3">
      <View class="flex-1">
        <Text>{events().join('|')}</Text>
        <Text>{`read-count:${events().filter((event) => event.startsWith('read-')).length}`}</Text>
        <Text>{`write-count:${changes().length}`}</Text>
        <Text>{`changes:${changes().join('|')}`}</Text>
        <Text>{`snapshot:${store.library()?.entries[0]?.position ?? 'none'}`}</Text>
        <Text>{`history:${store.entries()[0]?.position ?? 'none'}`}</Text>
        <Text>{`resume:${store.resume(drama)?.position ?? 'none'}`}</Text>
        <Text>{`state:${store.library.state()}`}</Text>
        <Text>{`loading:${store.library.loading()}`}</Text>
        <Text>{`error:${!!store.library.error()}`}</Text>
        <Text>{store.warning() || 'no-warning'}</Text>
        <Text>{`completion:${completion()}`}</Text>
        <Text>{`ids:${store
          .entries()
          .map((entry) => entry.drama.series_id)
          .join(',')}`}</Text>
        <Text>{`operation:${store.historyManagement.operation()?.status ?? 'none'}`}</Text>
        <Text>{`scope:${store.historyManagement.operation()?.ids.join(',') ?? ''}`}</Text>
        <Text>{`removed:${store.historyManagement.operation()?.completedIds.join(',') ?? ''}`}</Text>
        <Text>{`remaining:${store.historyManagement.operation()?.remainingIds.join(',') ?? ''}`}</Text>
      </View>
      <View class="flex-1 flex-row flex-wrap gap-2">
        <Button label="完成读取" onPress={() => reads.shift()?.finish()} />
        <Button label="其他所有者" onPress={() => reads.shift()?.finish('other')} />
        <Button label="读取失败" onPress={() => reads.shift()?.fail()} />
        <Button label="重新读取" onPress={() => void store.library.refetch()} />
        <Button label="保存20" onPress={() => void save(20)} />
        <Button label="保存40" onPress={() => void save(40)} />
        <Button
          label="保存其他剧"
          onPress={() =>
            void store.save(
              { ...drama, series_id: '124' },
              { index: 1, video_id: '457', locked: false },
              30,
              100,
            )
          }
        />
        <Button
          label="四条记录"
          onPress={() => {
            persisted = {
              owner_id: '',
              favorites: [],
              entries: ['123', '124', '125', '126'].map((id, index) => ({
                drama: { ...drama, series_id: id },
                episode: 1,
                video_id: '456',
                position: 10,
                duration: 100,
                last_played_at: 4 - index,
              })),
            };
            void store.library.refetch();
          }}
        />
        <Button
          label="删除123"
          onPress={() =>
            void Promise.resolve()
              .then(() => store.historyManagement.remove(['123']))
              .catch(() => completion.set('failed'))
          }
        />
        <Button
          label="删除四条"
          onPress={() =>
            void store.historyManagement.remove(['126', '125', '123', '124', '123', 'unknown'])
          }
        />
        <Button label="清空记录" onPress={() => void store.historyManagement.clear()} />
        <Button
          label="重试删除"
          onPress={() =>
            void store.historyManagement.retry(store.historyManagement.operation()?.id ?? 0)
          }
        />
        <Button label="完成写入" onPress={() => settleWrite()} />
        <Button label="写入失败" onPress={() => settleWrite(true)} />
        <Button label="提交后丢响应" onPress={() => settleWrite('lost')} />
        <Button label="失败回执丢失" onPress={() => settleWrite('lost-failure')} />
        <Button
          label="准备更新"
          onPress={() =>
            void store.prepareUpdate().then(
              () => completion.set('prepared'),
              () => completion.set('failed'),
            )
          }
        />
        <Button
          label="排空保存"
          onPress={() => void store.shutdown().then(() => completion.set('drained'))}
        />
      </View>
    </View>
  );
}
