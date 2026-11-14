import { host, openUrl } from 'nsh';
import { TvUpdates, type TvUpdater } from 'hongguo-tv/native';
import type { AppUpdate, InstallState, UpdateAdapter } from '@hongguo/app';

interface AndroidInfo {
  version: string;
  build: number;
  freeBytes: number;
  permission: boolean;
  state: string;
  message: string;
}
interface Snapshot {
  ready: boolean;
  received: number;
  path?: string;
  manifest?: {
    version: string;
    platforms: { android: { size: number } };
  };
}
export function tvUpdates(): UpdateAdapter {
  let native: TvUpdater | undefined;
  let closed = false;
  let awaitingPermission = false;
  let downloadCancelled = false;
  const snapshot = () => JSON.parse(native!.snapshot()) as Snapshot;
  const candidate = (): AppUpdate | undefined => {
    const value = snapshot().manifest;
    return value
      ? { version: value.version, size: value.platforms.android.size, canInstall: true }
      : undefined;
  };
  const info = () => host.call<AndroidInfo>('update.info');
  return {
    async initialize() {
      if (!host.available()) return { version: '开发版本', supported: false };
      const installed = await info();
      const owner = await TvUpdates.open(installed.build);
      if (closed) {
        owner.dispose();
        return { version: installed.version, supported: false };
      }
      native?.dispose();
      native = owner;
      return {
        version: installed.version,
        supported: true,
        update: candidate(),
        ready: snapshot().ready,
        installed: installed.state === 'success',
        installing: installed.state === 'installing',
      };
    },
    async check() {
      if (!native) throw new Error('更新服务尚未就绪，请重新打开应用');
      await native.check();
      return candidate() ?? null;
    },
    async download(progress) {
      downloadCancelled = false;
      const size = candidate()?.size;
      if (!size || (await info()).freeBytes < size * 2 + 32 * 1024 * 1024)
        throw new Error('空间不足，请清理空间后重试');
      if (closed || downloadCancelled) throw new Error('下载已取消');
      await host.call('update.allocate', size * 2 + 32 * 1024 * 1024);
      if (closed || downloadCancelled) throw new Error('下载已取消');
      const timer = setInterval(() => {
        if (closed) return;
        if (downloadCancelled) {
          native?.cancel();
          return;
        }
        const value = snapshot();
        progress(value.received, size);
      }, 250);
      try {
        await native!.download();
        progress(size, size);
      } finally {
        clearInterval(timer);
      }
    },
    cancel() {
      downloadCancelled = true;
      native?.cancel();
    },
    async install() {
      const value = snapshot();
      if (!value.ready || !value.path) throw new Error('更新包尚未准备好，请重新下载');
      const state = await host.call<InstallState>('update.install', JSON.stringify(value), {
        timeout: 0,
      });
      awaitingPermission = state === 'permission';
      return state;
    },
    async openPermission() {
      await host.call('update.permission');
    },
    async installationState() {
      const value = await info();
      if (awaitingPermission) {
        if (value.permission) {
          awaitingPermission = false;
          return 'ready';
        }
        return 'permission';
      }
      if (value.state === 'success') return 'success';
      if (value.state === 'installError') throw new Error(value.message || '安装未完成，请重试');
      if (value.state === 'installing') return 'installing';
      return value.permission ? 'ready' : 'permission';
    },
    async openRelease() {
      if (!(await openUrl('https://github.com/bijinfeng/hongguo-tv/releases/latest')).opened)
        throw new Error('无法打开下载页面');
    },
    dispose() {
      closed = true;
      native?.cancel();
      native?.dispose();
      native = undefined;
    },
  };
}
