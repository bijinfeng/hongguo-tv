import { Text, View, signal, host } from 'nsh';
import { Button, Product } from '@hongguo/ui';
import { configureTransport, type HistoryChange } from '@hongguo/core-client';
import { createStore } from '../src/store';
import { createUpdates, type AppUpdate, type InstallState } from '../src/updates';
import { UpdatesPage } from '../src/pages/Updates';

/** Deferred host operations exercise the production controller without an update server. */
export function UpdatesStateFixture() {
  if (host.params.saving) return <SaveFixture />;
  const visible = signal(true);
  const events = signal<string[]>([]);
  const log = (value: string) => events.update((all) => [...all, value]);
  let resolveCheck: (value: AppUpdate | null) => void = () => {};
  let rejectCheck: () => void = () => {};
  let resolveDownload: () => void = () => {};
  let rejectDownload: () => void = () => {};
  let progress: (received: number, total?: number) => void = () => {};
  const progressCallbacks: ((received: number, total?: number) => void)[] = [];
  let failSave = true;
  let installState: InstallState = 'permission';
  const example = {
    version: '1.1.0',
    size: 128 * 1048576,
    canInstall: true,
    notes: '修复播放恢复与选集体验，提升下载稳定性。',
  };
  let check = 0;
  let initialized = false;
  const updates = createUpdates(
    {
      async initialize() {
        if (host.params.initializeFailure && !initialized) {
          initialized = true;
          throw new Error('初始化失败');
        }
        return {
          version: '1.0.0',
          supported: !host.params.unsupported,
          ready: host.params.ready === true,
          installed: host.params.installed === true,
          update: host.params.ready ? example : undefined,
        };
      },
      check() {
        log(`check-${++check}`);
        if (host.params.presentation) return Promise.resolve(example);
        return new Promise((resolve, reject) => {
          resolveCheck = resolve;
          rejectCheck = () => reject(new Error('检查失败'));
        });
      },
      download(receive) {
        log('download');
        if (host.params.presentation) {
          receive(32 * 1048576, example.size);
          if (host.params.downloadError)
            return Promise.reject(new Error('更新下载中断，请检查网络后重试'));
          return new Promise<void>((resolve) => setTimeout(resolve, 2000));
        }
        progress = receive;
        progressCallbacks.push(receive);
        return new Promise((resolve, reject) => {
          resolveDownload = resolve;
          rejectDownload = () => reject(new Error('下载已取消'));
        });
      },
      cancel:
        host.params.presentation && !host.params.tv
          ? undefined
          : () => {
              log('cancel');
              rejectDownload();
            },
      async install() {
        log('install');
        if (host.params.installFailure) throw new Error('更新包验证失败，请重新下载');
        return installState;
      },
      async installationState() {
        return installState;
      },
      async openPermission() {
        log('permission');
      },
      async openRelease() {
        log('release');
      },
      dispose() {
        log('dispose');
      },
    },
    async () => {
      log('save');
      if (failSave) throw new Error('保存失败');
    },
  );
  return (
    <Product.Provider value={host.params.tv ? 'tv' : 'desktop'}>
      <View class="flex-1 bg-background">
        <If when={!host.params.presentation}>
          <Text testID="state">{`phase:${updates.phase()}`}</Text>
          <Text>{`bytes:${updates.received()}`}</Text>
          <Text>{events().join(',')}</Text>
          <View class="flex-row flex-wrap gap-2">
            <Button
              label="完成检查"
              onPress={() =>
                resolveCheck({
                  version: '1.1.0',
                  size: 1024,
                  canInstall: true,
                  notes: '修复播放体验',
                })
              }
            />
            <Button
              label="手动更新"
              onPress={() => resolveCheck({ version: '1.1.0', canInstall: false })}
            />
            <Button label="检查失败" onPress={() => rejectCheck()} />
            <Button
              label="重复检查"
              onPress={() => {
                void updates.check();
              }}
            />
            <Button label="完成下载" onPress={() => resolveDownload()} />
            <Button label="迟到进度" onPress={() => progressCallbacks[0]?.(9999, 99999)} />
            <Button label="下载进度" onPress={() => progress(512, 1024)} />
            <Button
              label="允许保存"
              onPress={() => {
                failSave = false;
              }}
            />
            <Button
              label="授权完成"
              onPress={() => {
                installState = 'ready';
              }}
            />
            <Button
              label="系统安装"
              onPress={() => {
                installState = 'installing';
              }}
            />
            <Button
              label="实际版本匹配"
              onPress={() => {
                installState = 'success';
              }}
            />
            <Button label="切换页面" onPress={() => visible.update((value) => !value)} />
          </View>
        </If>
        <If when={visible()}>
          <UpdatesPage updates={updates} tv={host.params.tv === true} />
        </If>
      </View>
    </Product.Provider>
  );
}

function SaveFixture() {
  const events = signal<string[]>([]);
  const result = signal('waiting');
  let fail = true;
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    async request<T>(path: string, _abort?: AbortSignal, body?: unknown): Promise<T> {
      if (path === '/api/v1/library' && body) {
        const change = body as Extract<HistoryChange, { action: 'progress' }>;
        events.update((all) => [...all, `episode-${change.episode}`]);
        if (fail) throw new Error('合成写入失败');
      }
      return { entries: [], owner_id: '', items: [], logged_in: false } as T;
    },
  });
  const store = createStore('desktop');
  const drama = { series_id: '123', title: '测试剧', cover: '', intro: '', episode_count: 2 };
  return (
    <View>
      <Text>{`save:${result()}`}</Text>
      <Text>{events().join(',')}</Text>
      <Text>{store.warning()}</Text>
      <Button
        label="保存第一集"
        onPress={() => {
          void store.save(drama, { index: 1, video_id: '1', locked: false }, 10, 100);
        }}
      />
      <Button
        label="保存第二集"
        onPress={() => {
          void store.save(drama, { index: 2, video_id: '2', locked: false }, 20, 100);
        }}
      />
      <Button
        label="恢复写入"
        onPress={() => {
          fail = false;
        }}
      />
      <Button
        label="准备更新"
        onPress={() => {
          void store.prepareUpdate().then(
            () => result.set('prepared'),
            () => result.set('failed'),
          );
        }}
      />
    </View>
  );
}
