import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import { configureTransport, type SearchSuggestions } from '@hongguo/core-client';
import { createSearchSuggestions } from '../src/search-suggestions';
import { createStore, type FocusSource } from '../src/store';
import { captureRequest } from '@hongguo/core-client';
import { validateSearchInput, suggestionInput } from '../src/search-input';

/** Abort-insensitive transport makes late completion guards observable. */
export function SuggestionsStateFixture() {
  const shown = signal(true);
  const events = signal<string[]>([]);
  const pending = new Map<
    number,
    { resolve: (data: SearchSuggestions) => void; reject: () => void }
  >();
  let number = 0;
  let controller: ReturnType<typeof createSearchSuggestions> | undefined;
  const draft = signal('甲');
  const active = signal(true);
  const record = (value: string) => events.update((all) => [...all, value]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, abort, body) {
      if (body !== undefined || !path.startsWith('/api/v1/search/suggestions?q='))
        throw new Error('Unexpected suggestion request');
      const id = ++number;
      record(`read-${id}-${decodeURIComponent(path.split('q=')[1])}`);
      abort?.addEventListener('abort', () => record(`abort-${id}`));
      return new Promise<SearchSuggestions>((resolve, reject) =>
        pending.set(id, { resolve, reject: () => reject(new Error('合成失败')) }),
      );
    },
  });
  const complete = (id: number) =>
    pending
      .get(id)
      ?.resolve({ items: [{ key: 'opaque', kind: 'common_query', name: `建议${id}` }] });
  function Owner() {
    const owned = createSearchSuggestions(captureRequest(), draft, active);
    controller = owned;
    cleanup(() => {
      controller = undefined;
    });
    return (
      <View testID="suggestions-owner">
        <Text>{`items:${owned
          .items()
          .map((item) => item.name)
          .join(',')}`}</Text>
        <Text>{`open:${owned.open()}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.error() ? 'suggestion-error' : 'no-error'}</Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background gap-2">
      <Button label="聚焦建议" onPress={() => controller?.focus()} />
      <Button label="输入乙" onPress={() => draft.set('乙')} />
      <Button label="开始组合" onPress={() => controller?.composition(true)} />
      <Button label="结束组合" onPress={() => controller?.composition(false)} />
      <Button label="关闭建议" onPress={() => controller?.dismiss()} />
      <Button label="离开建议" onPress={() => active.set(false)} />
      <Button label="返回建议" onPress={() => active.set(true)} />
      <Button label="重试建议" onPress={() => controller?.retry()} />
      <Button label="完成旧建议" onPress={() => complete(1)} />
      <Button label="完成当前建议" onPress={() => complete(number)} />
      <Button label="失败建议" onPress={() => pending.get(number)?.reject()} />
      <Button label="移除建议" onPress={() => shown.set(false)} />
      <Button
        label="验证输入"
        onPress={() => {
          const cases: [string, boolean][] = [
            ['字'.repeat(80), true],
            ['字'.repeat(81), false],
            ['😀'.repeat(50), true],
            ['😀'.repeat(51), false],
            ['甲\u0085乙', false],
            ['\uFEFF', true],
            [' \u2003甲\u2002乙 ', true],
            ['\n甲', false],
          ];
          if (cases.some(([value, valid]) => !!validateSearchInput(value).query !== valid))
            throw new Error('Search bounds mismatch');
          if (
            validateSearchInput(' \u2003甲\u2002乙 ').query !== '甲 乙' ||
            suggestionInput('\u2003甲\u2003') !== '甲' ||
            suggestionInput('字'.repeat(101))
          )
            throw new Error('Search whitespace mismatch');
          record('validation-passed');
        }}
      />
      <Text>{events().join('|') || 'none'}</Text>
      <If when={shown()}>
        <Owner />
      </If>
    </View>
  );
}

/** Event-turn harness: a newer user intent arrives before the pending return frames. */
export function ReturnFocusStateFixture() {
  const returns = signal(0);
  const shown = signal(true);
  const subscriptions = signal(0);
  let receiveFocus: Parameters<FocusSource>[0] | undefined;
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request: async () => ({ entries: [], items: [], logged_in: false }),
  });
  function Owner() {
    const store = createStore('desktop', undefined, (receive) => {
      receiveFocus = receive;
      subscriptions.update((value) => value + 1);
      return () => {
        receiveFocus = undefined;
        subscriptions.update((value) => value - 1);
      };
    });
    return (
      <View>
        <Button
          label="返回后遥控移动"
          onPress={() => {
            store.back();
            store.restoreFocus();
            receiveFocus?.(undefined);
          }}
        />
        <Button label="宿主输入焦点" onPress={() => receiveFocus?.('search-input')} />
        <Text>{`host-focus:${store.hostFocus()}`}</Text>
        <Button
          label="打开来源"
          onPress={() =>
            store.open({ series_id: '123', title: '来源', cover: '', intro: '' }, () =>
              returns.update((value) => value + 1),
            )
          }
        />
        <Button
          label="返回后用户移动"
          onPress={() => {
            store.back();
            store.restoreFocus();
            store.noteFocusIntent();
          }}
        />
        <Button
          label="正常返回来源"
          onPress={() => {
            store.back();
            store.restoreFocus();
          }}
        />
        <Text>{`returns:${returns()}`}</Text>
      </View>
    );
  }
  return (
    <View class="flex-1 bg-background">
      <Button label="移除焦点所有者" onPress={() => shown.set(false)} />
      <Text>{`focus-subscriptions:${subscriptions()}`}</Text>
      <If when={shown()}>
        <Owner />
      </If>
    </View>
  );
}
