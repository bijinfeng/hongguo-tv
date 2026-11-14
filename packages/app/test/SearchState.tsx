import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport } from '@hongguo/core-client';
import { createStore, type Store } from '../src/store';
import { Search } from '../src/pages/Search';
import { SearchForm } from '../src/SearchForm';

/** Explicit synthetic transport ignores abort so lifetime guards are exercised independently. */
export function SearchStateFixture(props: { focus?: boolean } = {}) {
  const events = signal<string[]>([]);
  const shown = signal(true);
  const record = (value: string) => events.update((all) => [...all, value]);
  let store: Store | undefined;
  let finish: (() => void) | undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];
  cleanup(() => timers.forEach(clearTimeout));
  // Schedule before focusing the real footer: command controls must not blur it at completion.
  const drive = (action: () => void) => {
    if (!props.focus) return action();
    timers.push(
      setTimeout(() => {
        const done = finish;
        action();
        done?.();
        finish = undefined;
      }, 1000),
    );
  };
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort) {
      const url = new URL(path, 'http://127.0.0.1:18765');
      if (url.pathname !== '/api/v1/search') return Promise.resolve({ entries: [] });
      const term = url.searchParams.get('q');
      const offset = url.searchParams.get('offset');
      record(`request-${term}-${offset ?? 'first'}`);
      const drama = {
        series_id: term === '新查询' ? '200' : '100',
        title: term,
        intro: '',
        cover: '',
      };
      if (!offset)
        return Promise.resolve({ items: [drama], source: 'web', has_more: true, next_offset: 1 });
      abort?.addEventListener('abort', () => record('cancelled'));
      return new Promise((resolve) => {
        finish = () =>
          resolve({
            items: [{ ...drama, series_id: '999' }],
            source: 'web',
            has_more: false,
            next_offset: 2,
          });
      });
    },
  });
  function Owner() {
    const owned = createStore('desktop');
    store = owned;
    if (props.focus) {
      const focus = owned.focusSearchInput;
      owned.focusSearchInput = () => {
        record('focus-handoff');
        focus();
      };
    }
    cleanup(() => {
      store = undefined;
    });
    return (
      <View class="flex-1">
        <If when={props.focus}>
          <SearchForm store={owned} />
          <If when={owned.activePage('search')}>
            <Search store={owned} />
          </If>
        </If>
        <Text testID="search-state">
          {owned
            .catalog()
            ?.items.map((item) => item.series_id)
            .join(',') || 'empty'}
        </Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background gap-3">
      <Button
        label="搜索旧查询"
        onPress={() => {
          store?.draft.set('旧查询');
          store?.submit();
        }}
      />
      <Button
        label="追加两次"
        onPress={() => {
          void store?.loadMore();
          void store?.loadMore();
        }}
      />
      <Button
        label="搜索新查询"
        onPress={() =>
          drive(() => {
            store?.draft.set('新查询');
            store?.submit();
          })
        }
      />
      <Button label="离开查询" onPress={() => drive(() => store?.navigate('home'))} />
      <Button label="刷新查询" onPress={() => drive(() => store?.results.refetch())} />
      <Button
        label="替换宿主"
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
        label="完成旧页"
        onPress={() =>
          drive(() => {
            if (!props.focus) {
              finish?.();
              finish = undefined;
            }
          })
        }
      />
      <Button label="移除查询" onPress={() => drive(() => shown.set(false))} />
      <Text>{events().join('|') || 'none'}</Text>
      <If when={shown()}>{() => <Owner />}</If>
    </View>
  );
}

/** Real Search ownership for focus guards; controls above it only drive the test. */
export function SearchFocusStateFixture() {
  return <SearchStateFixture focus />;
}
