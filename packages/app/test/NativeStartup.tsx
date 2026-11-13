import { cleanup, host, signal, Text, View, type ImageAsset } from 'nsh';
import { Button } from '@hongguo/ui';
import type { NativeSession } from '@hongguo/core-client/native';
import { configureTransport } from '@hongguo/core-client';
import { createStore } from '../src/store';
import { progressSession } from '../src/playback';
import { NativeApp } from '../src/NativeApp';

/** Synthetic lifecycle fixture, never a product entry or installed-business acceptance. */
export function NativeStartupFixture(props: { logoMark: ImageAsset }) {
  if (host.params.scenario === 'drain') return <StoreDrainFixture />;
  const events = signal<string[]>([]);
  const shown = signal(true);
  const pending = signal(false);
  const scenario = host.params.scenario;
  const record = (value: string) => events.update((all) => [...all, value]);
  let attempts = 0;
  let finish: (() => void) | undefined;
  const session = (): NativeSession => ({
    origin: () => 'http://127.0.0.1:18765',
    start(path) {
      record(path);
      return {
        result: async () =>
          JSON.stringify({
            status: path === '/api/v1/account' ? 501 : 200,
            body:
              path === '/api/v1/account'
                ? { ok: false, code: 'CORE_NOT_IMPLEMENTED', error: '此功能尚未开放' }
                : { ok: true, data: { entries: [], owner_id: '' } },
          }),
        accept() {},
        cancel() {},
        dispose() {},
      };
    },
    close: () => record('closed'),
    dispose: () => record('session-disposed'),
  });
  const openCore = async () => {
    attempts += 1;
    record('opened');
    if (scenario === 'failure' && attempts === 1)
      throw new Error(
        JSON.stringify({
          status: 500,
          body: { code: 'LIBRARY_STORAGE_UNAVAILABLE', error: '观看记录暂时无法读取，请重试' },
        }),
      );
    if (scenario === 'late') {
      pending.set(true);
      return new Promise<NativeSession>((resolve) => {
        finish = () => resolve(session());
      });
    }
    return session();
  };
  return (
    <View class="flex-1 bg-background">
      <If when={host.params.presentation !== true}>
        <View class="flex-row gap-3 p-4">
          <Button label="移除应用" onPress={() => shown.set(false)} />
          <Button
            label="完成启动"
            disabled={!pending()}
            onPress={() => {
              finish?.();
              pending.set(false);
            }}
          />
        </View>
        <Text testID="native-events">{events().join('|') || 'none'}</Text>
      </If>
      <If when={shown()}>
        {() => (
          <NativeApp
            target={host.params.target === 'tv' ? 'tv' : 'desktop'}
            logoMark={props.logoMark}
            runtime={
              scenario === 'http-preview'
                ? { mode: 'http-preview', coreOrigin: 'http://127.0.0.1:18997' }
                : { mode: scenario === 'invalid' ? 'unknown' : 'native' }
            }
            openCore={openCore}
          />
        )}
      </If>
    </View>
  );
}

/** Real store/progress queue under a retained owner; transport commits are controlled by the test. */
function StoreDrainFixture() {
  const events = signal<string[]>([]);
  const shown = signal(true);
  let finish: (() => void) | undefined;
  const record = (value: string) => events.update((all) => [...all, value]);
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(_path, _signal, body) {
      if (!body) return Promise.resolve({ entries: [], owner_id: '' });
      const position = (body as { position: number }).position;
      record(`writing-${position}`);
      return new Promise((resolve) => {
        finish = () => {
          record(`committed-${position}`);
          resolve({ entries: [], owner_id: '' });
        };
      });
    },
  });
  function Watching() {
    const store = createStore('desktop');
    const drama = { series_id: '11', title: '合成短剧', intro: '', cover: '' };
    const episode = { index: 1, video_id: '22', locked: false };
    const progress = progressSession((position, duration, completed) => {
      void store.save(drama, episode, position, duration, completed);
    });
    store.registerPlayerCheckpoint(progress.save);
    // The earlier write blocks; the actual viewed five-second checkpoint waits behind it.
    void store.save(drama, episode, 1, 60);
    progress.update(5, 60, true);
    cleanup(() => {
      void store.shutdown().finally(() => record('closed'));
    });
    return <Text>正在观看</Text>;
  }
  return (
    <View class="flex-1 bg-background">
      <Button
        label="移除应用"
        onPress={() => {
          configureTransport({
            mediaOrigin: 'http://127.0.0.1:18766',
            request: async () => {
              record('foreign');
              return {};
            },
          });
          shown.set(false);
        }}
      />
      <Button
        label="完成写入"
        onPress={() => {
          const next = finish;
          finish = undefined;
          next?.();
        }}
      />
      <Text>{events().join('|')}</Text>
      <If when={shown()}>{() => <Watching />}</If>
    </View>
  );
}
