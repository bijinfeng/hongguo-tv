import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type SearchHistoryChange } from '@hongguo/core-client';
import { createStore, type Store } from '../src/store';

/** Deliberately ignores cancellation to exercise mounted keyword ownership. */
export function RecentSearchStateFixture() {
  const events = signal<string[]>([]);
  const shown = signal(true);
  let store: Store | undefined;
  let finishRead: (() => void) | undefined;
  let finishWrite: ((fail?: boolean) => void) | undefined;
  let items = ['原关键词'];
  const record = (value: string) => events.update((all) => [...all, value]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort, body) {
      if (path === '/api/v1/search/history') {
        if (body === undefined) {
          record('read');
          abort?.addEventListener('abort', () => record('read-cancelled'));
          const snapshot = items.slice();
          return new Promise((resolve) => {
            finishRead = () => resolve({ items: snapshot });
          });
        }
        const action = body as SearchHistoryChange;
        record(action.action === 'add' ? `add-${action.query}` : 'clear');
        return new Promise((resolve, reject) => {
          finishWrite = (fail) => {
            if (fail) {
              reject(new Error('合成关键词写入失败'));
              return;
            }
            items =
              action.action === 'clear'
                ? []
                : [action.query, ...items.filter((s) => s !== action.query)].slice(0, 10);
            resolve({ items: items.slice() });
          };
        });
      }
      if (path.startsWith('/api/v1/search?'))
        return Promise.resolve({ items: [], has_more: false });
      return Promise.resolve({ entries: [], logged_in: false });
    },
  });
  function Owner() {
    const owned = createStore('desktop');
    store = owned;
    cleanup(() => {
      store = undefined;
    });
    return (
      <View testID="recent-owner">
        <Text>{`items:${owned.recent.items().join(',')}`}</Text>
        <Text>{`pending:${owned.recent.saving()}`}</Text>
        <Text>{owned.recent.error() || 'no-error'}</Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background gap-2">
      <Button label="进入发现" onPress={() => store?.navigate('search')} />
      <Button
        label="查询一"
        onPress={() => {
          store?.draft.set('查询一');
          store?.submit();
        }}
      />
      <Button
        label="查询二"
        onPress={() => {
          store?.draft.set('查询二');
          store?.submit();
        }}
      />
      <Button
        label="清空关键词"
        onPress={() => {
          void store?.recent.clear();
        }}
      />
      <Button
        label="重试关键词"
        onPress={() => {
          void store?.recent.retry();
        }}
      />
      <Button
        label="完成读取"
        onPress={() => {
          const done = finishRead;
          finishRead = undefined;
          done?.();
        }}
      />
      <Button
        label="完成写入"
        onPress={() => {
          const done = finishWrite;
          finishWrite = undefined;
          done?.();
        }}
      />
      <Button
        label="失败写入"
        onPress={() => {
          const done = finishWrite;
          finishWrite = undefined;
          done?.(true);
        }}
      />
      <Button
        label="替换关键词宿主"
        onPress={() =>
          configureTransport({
            mediaOrigin: 'http://127.0.0.1:18766',
            request: async () => {
              record('foreign');
              return {};
            },
          })
        }
      />
      <Button
        label="排空关键词"
        onPress={() => {
          void store?.shutdown().then(() => record('drained'));
        }}
      />
      <Button label="移除关键词" onPress={() => shown.set(false)} />
      <Text>{events().join('|') || 'none'}</Text>
      <If when={shown()}>{() => <Owner />}</If>
    </View>
  );
}
