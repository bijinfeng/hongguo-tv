import { Scroll, Text, View, cleanup, effect, signal, announce, type ViewRef } from 'nsh';
import { Button, ContentArrival, DownloadProgress, tvUnit } from '@hongguo/ui';
import type { Updates, UpdatePhase } from '../updates';

const titles: Record<UpdatePhase, string> = {
  initializing: '正在打开更新服务',
  idle: '检查应用更新',
  checking: '正在检查更新',
  latest: '已是最新版本',
  available: '发现新版本',
  manual: '前往下载更新',
  downloading: '正在下载更新',
  cancelling: '正在取消下载',
  ready: '更新已准备好',
  saving: '正在保存观看进度',
  installing: '等待更新完成',
  permission: '需要允许安装应用',
  success: '应用已更新',
  checkError: '无法检查更新',
  downloadError: '更新下载失败',
  saveError: '观看进度未能保存',
  installError: '安装未完成',
};
export function UpdatesPage(props: {
  updates: Updates;
  tv: boolean;
  active?: boolean;
  focusGuard?: () => () => boolean;
}) {
  const state = props.updates;
  effect(() => {
    if (props.active !== false) announce(titles[state.phase()]);
  });
  let primary: ViewRef | undefined;
  const busy = () =>
    ['initializing', 'checking', 'downloading', 'cancelling', 'saving', 'installing'].includes(
      state.phase(),
    );
  const pendingFocus = signal<(() => boolean) | undefined>(props.focusGuard?.() ?? (() => true));
  let frame = 0;
  effect(() => {
    const ownsFocus = pendingFocus();
    if (!ownsFocus || props.active === false || busy()) return;
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (props.active === false || busy()) return;
        pendingFocus.set(undefined);
        if (ownsFocus()) primary?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  });
  cleanup(() => cancelAnimationFrame(frame));
  const label = () => {
    switch (state.phase()) {
      case 'available':
      case 'downloadError':
        return '下载更新';
      case 'ready':
      case 'installError':
      case 'saveError':
        return props.tv ? '安装更新…' : '重启更新';
      case 'permission':
        return '前往设置…';
      case 'manual':
        return '前往下载页面…';
      case 'success':
      case 'latest':
        return '再次检查';
      default:
        return busy() ? titles[state.phase()] : '检查更新';
    }
  };
  const act = () => {
    if (!['permission', 'manual'].includes(state.phase()))
      pendingFocus.set(props.focusGuard?.() ?? (() => true));
    switch (state.phase()) {
      case 'available':
      case 'downloadError':
        void state.download();
        break;
      case 'ready':
      case 'installError':
      case 'saveError':
        void state.install();
        break;
      case 'permission':
        void state.permission();
        break;
      case 'manual':
        void state.openRelease();
        break;
      default:
        void state.check();
    }
  };
  return (
    <Scroll class="flex-1">
      <ContentArrival class={props.tv ? 'gap-8 py-8' : 'gap-8 px-10 py-6 max-w-4xl'}>
        <Text
          class="text-2xl font-semibold text-foreground"
          style={props.tv ? { fontSize: tvUnit(36) } : undefined}
        >
          应用更新
        </Text>
        <View class="gap-6">
          <Text
            class="text-base text-muted-foreground"
            style={props.tv ? { fontSize: tvUnit(24) } : undefined}
          >
            {state.version() ? `当前版本 ${state.version()}` : '正在读取当前版本'}
          </Text>
          <View>
            <Text
              testID="update-status"
              class="text-2xl text-foreground"
              style={props.tv ? { fontSize: tvUnit(32) } : undefined}
            >
              {titles[state.phase()]}
            </Text>
          </View>
          <If when={state.update()}>
            <Text
              class="text-lg text-foreground"
              style={props.tv ? { fontSize: tvUnit(24) } : undefined}
            >
              {`新版本 ${state.update()?.version}${state.update()?.size ? ` · ${(state.update()!.size! / 1048576).toFixed(1)} MB` : ''}`}
            </Text>
          </If>
          <If when={['downloading', 'cancelling'].includes(state.phase())}>
            <DownloadProgress received={state.received()} total={state.total()} />
          </If>
          <If when={state.error()}>
            <Text
              class="text-base text-destructive"
              style={props.tv ? { fontSize: tvUnit(24) } : undefined}
            >
              {state.error()}
            </Text>
          </If>
          <If when={state.phase() === 'permission'}>
            <Text
              class="text-base text-muted-foreground"
              style={props.tv ? { fontSize: tvUnit(24) } : undefined}
            >
              在系统设置中允许红果安装应用，返回后继续安装
            </Text>
          </If>
          <View class="items-start gap-4">
            <Button
              testID="navigation-primary-update"
              buttonRef={(ref) => {
                primary = ref;
              }}
              label={label()}
              primary
              disabled={busy()}
              onPress={act}
            />
            <If when={state.canCancel && state.phase() === 'downloading'}>
              <Button label="取消下载" variant="quiet" onPress={state.cancel} />
            </If>
            <If when={state.phase() === 'installError' && state.update()}>
              <Button
                label="重新下载"
                variant="quiet"
                onPress={() => {
                  pendingFocus.set(props.focusGuard?.() ?? (() => true));
                  void state.redownload();
                }}
              />
            </If>
          </View>
        </View>
        <If when={state.update()?.notes}>
          <View class="gap-4">
            <Text class="text-lg font-semibold text-foreground">本版更新</Text>
            <Text class="text-base text-muted-foreground">{state.update()?.notes}</Text>
          </View>
        </If>
      </ContentArrival>
    </Scroll>
  );
}
