import { cleanup, resource, View, type ImageAsset } from 'nsh';
import { configureClient, configureTransport, CoreError } from '@hongguo/core-client';
import { createNativeTransport, type NativeSession } from '@hongguo/core-client/native';
import { Notice, Product, type ProductTarget } from '@hongguo/ui';
import { App } from './index';
import type { FocusSource } from './store';
import type { PlaybackCommandSource } from './playback';

function initializationError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const reply = JSON.parse(message) as { body?: { code?: string; error?: string } };
    if (typeof reply.body?.code === 'string' && typeof reply.body.error === 'string')
      return new CoreError(reply.body.error, reply.body.code, 500);
  } catch {
    // Native initialization can also fail before a core envelope exists.
  }
  if (message.startsWith('NATIVE_DATA_UNAVAILABLE:'))
    return new CoreError('应用数据目录不可用，请重新打开应用', 'NATIVE_DATA_UNAVAILABLE', 500);
  return new CoreError('应用启动失败，请重试', 'NATIVE_INITIALIZATION_FAILED', 500);
}

/** Own one native core for the mounted application; failed opens never select an HTTP fallback. */
export function NativeApp(props: {
  target: ProductTarget;
  logoMark: ImageAsset;
  runtime: { mode: string; coreOrigin?: string };
  openCore: () => Promise<NativeSession>;
  subscribePlayerCommands?: PlaybackCommandSource;
  subscribeFocus?: FocusSource;
}) {
  let transport: ReturnType<typeof createNativeTransport> | undefined;
  let handedOff = false;
  const ready = resource(async ({ signal }) => {
    if (props.runtime.mode === 'http-preview') {
      if (!props.runtime.coreOrigin) throw new Error('应用配置不可用，请重新安装或联系维护者');
      try {
        configureClient(props.runtime.coreOrigin);
      } catch {
        throw new Error('应用配置不可用，请重新安装或联系维护者');
      }
      return true;
    }
    if (props.runtime.mode !== 'native' || props.runtime.coreOrigin !== undefined)
      throw new Error('应用配置不可用，请重新安装或联系维护者');
    let session: NativeSession | undefined;
    try {
      session = await props.openCore();
      if (signal.aborted) {
        session.dispose();
        return false;
      }
      const next = createNativeTransport(session);
      configureTransport(next);
      transport = next;
      return true;
    } catch (error) {
      session?.dispose();
      throw initializationError(error);
    }
  });
  cleanup(() => {
    if (!handedOff) transport?.close();
  });
  return (
    <Product.Provider value={props.target}>
      <If
        when={ready()}
        else={
          <View
            testID="native-startup"
            class="flex-1 items-center justify-center bg-background p-10"
          >
            <View class="w-full max-w-2xl">
              <Notice
                message={
                  ready.loading()
                    ? '正在打开…'
                    : ready.error() instanceof Error
                      ? (ready.error() as Error).message
                      : '正在打开…'
                }
                error={!ready.loading() && !!ready.error()}
                retry={ready.error() && !ready.loading() ? ready.refetch : undefined}
              />
            </View>
          </View>
        }
      >
        {() => {
          const owner = transport;
          return (
            <App
              target={props.target}
              logoMark={props.logoMark}
              subscribePlayerCommands={props.subscribePlayerCommands}
              subscribeFocus={props.subscribeFocus}
              onReady={() => {
                handedOff = !!owner;
              }}
              onShutdown={
                owner
                  ? (drained) => {
                      void drained.finally(() => owner.close());
                    }
                  : undefined
              }
            />
          );
        }}
      </If>
    </Product.Provider>
  );
}
