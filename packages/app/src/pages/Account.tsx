import { Image, Text, View, signal, cleanup } from 'nsh';
import { request, type Account as AccountStatus } from '@hongguo/core-client';
import { Button, Notice, Surface } from '@hongguo/ui';
import type { Store } from '../store';
export function Account(props: { store: Store }) {
  const busy = signal(false);
  const error = signal('');
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let qrId: string | undefined;
  let closed = false;
  const poll = async () => {
    try {
      const status = await request<AccountStatus>(
        `/api/v1/account/qr/status?id=${qrId}`,
        controller?.signal,
      );
      if (closed) return;
      props.store.account.mutate(status);
      if (status.logged_in) {
        props.store.library.refetch();
        return;
      }
      if (['expired', 'failed', 'cancelled'].includes(status.qr_login?.state ?? '')) return;
      timer = setTimeout(() => {
        void poll();
      }, 1800);
    } catch (err) {
      if (!closed) error.set(String(err));
    }
  };
  const start = async () => {
    busy.set(true);
    error.set('');
    clearTimeout(timer);
    controller?.abort();
    controller = new AbortController();
    try {
      const status = await request<AccountStatus>(
        '/api/v1/account/qr/start',
        controller.signal,
        {},
      );
      if (closed) return;
      props.store.account.mutate(status);
      qrId = status.qr_login?.id;
      if (qrId)
        timer = setTimeout(() => {
          void poll();
        }, 1800);
    } catch (err) {
      if (!closed) error.set(String(err));
    } finally {
      if (!closed) busy.set(false);
    }
  };
  cleanup(() => {
    closed = true;
    clearTimeout(timer);
    controller?.abort();
    if (qrId && !props.store.account()?.logged_in)
      void request('/api/v1/account/qr/cancel', undefined, { id: qrId }).catch(() => {});
  });
  return (
    <View class="flex-1 gap-5 p-5 md:p-8">
      <Text class="text-2xl font-semibold text-foreground">账号</Text>
      <Surface>
        <Text class="text-lg text-foreground">
          {props.store.account()?.logged_in
            ? props.store.account()?.profile?.name || '已登录'
            : '尚未登录'}
        </Text>
        <If when={!props.store.account()?.logged_in}>
          <Button
            label={busy() ? '正在获取二维码…' : '扫码登录'}
            primary
            disabled={busy() || props.store.account.loading()}
            onPress={() => {
              void start();
            }}
          />
          <If when={props.store.account()?.qr_login?.image}>
            <Image src={props.store.account()?.qr_login?.image} class="w-56 h-56" />
          </If>
          <If when={props.store.account()?.qr_login}>
            <Text class="text-base text-muted-foreground">
              {(
                {
                  waiting: '请用红果 App 扫码',
                  scanned: '请在手机上确认',
                  confirmed: '正在登录…',
                  expired: '二维码已过期，请重新获取',
                  failed: '登录失败，请重新获取',
                  cancelled: '登录已取消',
                } as Record<string, string>
              )[props.store.account()?.qr_login?.state ?? ''] || '等待扫码确认'}
            </Text>
          </If>
        </If>
      </Surface>
      <If when={error() || props.store.account.error() || props.store.account()?.error}>
        <Notice
          error
          message={error() || String(props.store.account.error() || props.store.account()?.error)}
          retry={props.store.account.refetch}
        />
      </If>
    </View>
  );
}
