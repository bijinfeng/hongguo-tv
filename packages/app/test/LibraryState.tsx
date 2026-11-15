import { Text, View, signal } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type HistoryChange, type Library } from '@hongguo/core-client';
import { createStore } from '../src/store';

/** Deferred synthetic responses deliberately ignore abort to test publication ownership. */
export function LibraryStateFixture() {
  const events = signal<string[]>([]);
  const completion = signal('idle');
  const drama = { series_id: '123', title: '状态边界', cover: '', intro: '' };
  let persisted: Library = {
    owner_id: '',
    entries: [
      { drama, episode: 1, video_id: '456', position: 10, duration: 100, last_played_at: 1 },
    ],
  };
  const reads: { finish: (owner?: string) => void; fail: () => void }[] = [];
  let write: ((fail?: boolean) => void) | undefined;
  let readCount = 0;
  let writeCount = 0;
  let inFlight = 0;
  const log = (value: string) => events.update((items) => [...items, value]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort, body) {
      if (path !== '/api/v1/library')
        return Promise.resolve({ items: [], entries: [], logged_in: false });
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
      log(`write-${++writeCount}-${++inFlight}`);
      return new Promise((resolve, reject) => {
        write = (fail) => {
          inFlight--;
          if (fail) {
            reject(new Error('合成保存失败'));
            return;
          }
          if (change.action !== 'progress') throw new Error('Unexpected boundary fixture write');
          persisted = {
            owner_id: '',
            entries: [{ ...change, drama: change.drama, last_played_at: writeCount }],
          };
          resolve(persisted);
        };
      });
    },
  });
  const store = createStore('desktop');
  const save = (position: number) =>
    store.save(drama, { index: 1, video_id: '456', locked: false }, position, 100);
  const settleWrite = (fail?: boolean) => {
    const current = write;
    write = undefined;
    current?.(fail);
  };
  return (
    <View>
      <Text>{events().join('|')}</Text>
      <Text>{`snapshot:${store.library()?.entries[0]?.position ?? 'none'}`}</Text>
      <Text>{`history:${store.entries()[0]?.position ?? 'none'}`}</Text>
      <Text>{`resume:${store.resume(drama)?.position ?? 'none'}`}</Text>
      <Text>{`state:${store.library.state()}`}</Text>
      <Text>{`loading:${store.library.loading()}`}</Text>
      <Text>{`error:${!!store.library.error()}`}</Text>
      <Text>{store.warning() || 'no-warning'}</Text>
      <Text>{`completion:${completion()}`}</Text>
      <Button label="完成读取" onPress={() => reads.shift()?.finish()} />
      <Button label="其他所有者" onPress={() => reads.shift()?.finish('other')} />
      <Button label="读取失败" onPress={() => reads.shift()?.fail()} />
      <Button label="重新读取" onPress={() => void store.library.refetch()} />
      <Button label="保存20" onPress={() => void save(20)} />
      <Button label="保存40" onPress={() => void save(40)} />
      <Button label="完成写入" onPress={() => settleWrite()} />
      <Button label="写入失败" onPress={() => settleWrite(true)} />
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
  );
}
