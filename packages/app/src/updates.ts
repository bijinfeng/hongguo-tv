import { cleanup, signal } from 'nsh';

export interface AppUpdate {
  version: string;
  notes?: string | null;
  size?: number;
  canInstall: boolean;
}
export type InstallState = 'installing' | 'permission' | 'ready' | 'success';
/** Hosts own downloads and installation; the app owns display state and user intent. */
export interface UpdateAdapter {
  initialize(): Promise<{
    version: string;
    supported: boolean;
    update?: AppUpdate;
    ready?: boolean;
    installed?: boolean;
    installing?: boolean;
  }>;
  check(): Promise<AppUpdate | null>;
  download(progress: (received: number, total?: number | null) => void): Promise<void>;
  install(): Promise<InstallState>;
  openRelease(): Promise<void>;
  cancel?(): void;
  openPermission?(): Promise<void>;
  installationState?(): Promise<InstallState>;
  dispose?(): void;
}
export type UpdatePhase =
  | 'initializing'
  | 'idle'
  | 'checking'
  | 'latest'
  | 'available'
  | 'manual'
  | 'downloading'
  | 'cancelling'
  | 'ready'
  | 'saving'
  | 'installing'
  | 'permission'
  | 'success'
  | 'checkError'
  | 'downloadError'
  | 'saveError'
  | 'installError';

/** One controller per app root; navigating away never starts another operation. */
export function createUpdates(adapter: UpdateAdapter, prepare: () => Promise<void>) {
  const phase = signal<UpdatePhase>('initializing');
  const version = signal('');
  const update = signal<AppUpdate | undefined>(undefined);
  const received = signal(0);
  const total = signal<number | undefined>(undefined);
  const error = signal('');
  let closed = false;
  let initialized = false;
  let busy = false;
  let cancelled = false;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const message = (reason: unknown, fallback: string) =>
    reason instanceof Error ? reason.message : fallback;
  const fail = (state: UpdatePhase, reason: unknown, fallback: string) => {
    if (closed) return;
    error.set(message(reason, fallback));
    phase.set(state);
  };
  const polling = () => {
    clearTimeout(poll);
    if (closed || !adapter.installationState || !['installing', 'permission'].includes(phase()))
      return;
    poll = setTimeout(async () => {
      try {
        const state = await adapter.installationState!();
        if (closed) return;
        phase.set(state);
        polling();
      } catch (reason) {
        fail('installError', reason, '安装未完成，请重试');
      }
    }, 750);
  };
  const check = async () => {
    if (
      closed ||
      busy ||
      !['idle', 'latest', 'success', 'available', 'checkError', 'downloadError'].includes(phase())
    )
      return;
    if (!initialized) {
      await initialize();
      return;
    }
    busy = true;
    error.set('');
    phase.set('checking');
    try {
      const candidate = await adapter.check();
      if (closed) return;
      update.set(candidate ?? undefined);
      phase.set(candidate ? (candidate.canInstall ? 'available' : 'manual') : 'latest');
    } catch (reason) {
      fail('checkError', reason, '无法检查更新，请稍后重试');
    } finally {
      busy = false;
    }
  };
  const download = async () => {
    if (closed || busy || !update() || !['available', 'downloadError'].includes(phase())) return;
    busy = true;
    cancelled = false;
    received.set(0);
    total.set(update()?.size);
    error.set('');
    phase.set('downloading');
    let ownsProgress = true;
    try {
      await adapter.download((bytes, length) => {
        if (closed || cancelled || !ownsProgress) return;
        received.set(bytes);
        if (length != null) total.set(length);
      });
      if (!closed) phase.set('ready'); // Host promises this only after verification.
    } catch (reason) {
      if (cancelled) {
        if (!closed) phase.set('available');
      } else fail('downloadError', reason, '更新下载失败，请重试');
    } finally {
      ownsProgress = false;
      busy = false;
    }
  };
  const install = async () => {
    if (closed || busy || !['ready', 'saveError', 'installError'].includes(phase())) return;
    busy = true;
    error.set('');
    phase.set('saving');
    try {
      await prepare();
    } catch (reason) {
      fail('saveError', reason, '观看进度未能保存，请重试');
      busy = false;
      return;
    }
    if (closed) {
      busy = false;
      return;
    }
    phase.set('installing');
    try {
      const state = await adapter.install();
      if (!closed) {
        phase.set(state);
        polling();
      }
    } catch (reason) {
      fail('installError', reason, '更新安装失败，请重试');
    } finally {
      busy = false;
    }
  };
  const initialize = async () => {
    try {
      if (busy || closed) return;
      busy = true;
      phase.set('initializing');
      const initial = await adapter.initialize();
      initialized = true;
      busy = false;
      if (closed) return;
      version.set(initial.version);
      update.set(initial.update);
      phase.set(
        initial.installing
          ? 'installing'
          : initial.ready
            ? 'ready'
            : initial.installed
              ? 'success'
              : initial.supported
                ? 'idle'
                : 'manual',
      );
      if (phase() === 'idle') await check();
      else polling();
    } catch (reason) {
      busy = false;
      fail('checkError', reason, '无法打开更新服务，请重试');
    }
  };
  cleanup(() => {
    closed = true;
    clearTimeout(poll);
    adapter.dispose?.();
  });
  void initialize();
  return {
    phase,
    version,
    update,
    received,
    total,
    error,
    check,
    download,
    install,
    async redownload() {
      if (closed || busy || phase() !== 'installError' || !update()) return;
      phase.set('available');
      await download();
    },
    canCancel: !!adapter.cancel,
    cancel() {
      if (phase() !== 'downloading' || !adapter.cancel) return;
      cancelled = true;
      phase.set('cancelling');
      adapter.cancel();
    },
    async permission() {
      if (phase() !== 'permission' || !adapter.openPermission) return;
      try {
        await adapter.openPermission();
        polling();
      } catch (reason) {
        fail('installError', reason, '无法打开安装授权设置');
      }
    },
    async openRelease() {
      try {
        await adapter.openRelease();
      } catch (reason) {
        if (!closed) error.set(message(reason, '无法打开下载页面'));
      }
    },
  };
}
export type Updates = ReturnType<typeof createUpdates>;
