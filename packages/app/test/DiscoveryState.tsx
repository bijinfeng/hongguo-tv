import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type SearchDiscovery } from '@hongguo/core-client';
import { createStore, type Store } from '../src/store';

/** Deliberately ignores abort to verify the resource's ownership boundary. */
export function DiscoveryStateFixture() {
  const shown = signal(true);
  const events = signal<string[]>([]);
  const pending = new Map<
    number,
    { resolve: (data: SearchDiscovery) => void; reject: () => void }
  >();
  let store: Store | undefined;
  let number = 0;
  const record = (event: string) => events.update((all) => [...all, event]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort, body) {
      if (path === '/api/v1/search/discovery') {
        if (body !== undefined) throw new Error('Discovery must be read-only');
        const id = ++number;
        record(`read-${id}`);
        abort?.addEventListener('abort', () => record(`abort-${id}`));
        return new Promise<SearchDiscovery>((resolve, reject) =>
          pending.set(id, { resolve, reject: () => reject(new Error('合成发现失败')) }),
        );
      }
      if (path === '/api/v1/search/history') return Promise.resolve({ items: [] });
      if (path.startsWith('/api/v1/search?'))
        return Promise.resolve({ items: [], has_more: false });
      return Promise.resolve({ entries: [], logged_in: false });
    },
  });
  const complete = (id: number, empty = false) => {
    pending.get(id)?.resolve({
      guesses: empty
        ? []
        : [{ series_id: '', title: `建议${id}`, query: `建议${id}`, cover: '', intro: '' }],
      boards: [],
    });
    pending.delete(id);
  };
  function Owner() {
    const owned = createStore('desktop');
    store = owned;
    cleanup(() => {
      store = undefined;
    });
    return (
      <View testID="discovery-owner">
        <Text>{`data:${
          owned
            .discoveryData()
            ?.guesses.map((item) => item.title)
            .join(',') ?? 'none'
        }`}</Text>
        <Text>{`state:${owned.discovery.state()}`}</Text>
        <Text>{owned.discovery.error() ? 'discovery-error' : 'no-discovery-error'}</Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background gap-2">
      <Button label="进入发现" onPress={() => store?.navigate('search')} />
      <Button label="离开发现" onPress={() => store?.navigate('home')} />
      <Button
        label="提交关键词"
        onPress={() => {
          store?.draft.set('本地搜索词');
          store?.submit();
        }}
      />
      <Button label="清除关键词" onPress={() => store?.clearQuery()} />
      <Button label="刷新发现" onPress={() => store?.discovery.refetch()} />
      <Button label="完成旧发现" onPress={() => complete(1)} />
      <Button label="完成最新发现" onPress={() => complete(number)} />
      <Button label="空发现" onPress={() => complete(number, true)} />
      <Button label="失败发现" onPress={() => pending.get(number)?.reject()} />
      <Button label="移除发现" onPress={() => shown.set(false)} />
      <Text>{events().join('|')}</Text>
      <If when={shown()}>
        <Owner />
      </If>
    </View>
  );
}
