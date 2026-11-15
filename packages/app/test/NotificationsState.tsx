import { View, signal } from 'nsh';
import { Button, UiText } from '@hongguo/ui';
import {
  captureRequest,
  configureTransport,
  type Account,
  type NotificationItem,
  type NotificationMarkReadRequest,
  type NotificationQuery,
  type NotificationSnapshot,
} from '@hongguo/core-client';
import { createNotificationsState } from '../src/notifications-state';

const owner = '9007199254740993';
const itemId = 'follow:9007199254740993:2';
const account = (epoch: string): Account => ({
  logged_in: true,
  owner_id: owner,
  owner_epoch: epoch.repeat(32),
  profile: { uid: owner, name: '通知合成账号' },
  sync: { state: 'idle', pending: 0 },
  qr_login_available: true,
  phone_login_available: true,
});
const item = (read = false): NotificationItem => ({
  id: itemId,
  kind: 'follow_update',
  series_id: '123',
  title: '合成追更作品',
  episode: 2,
  message: '更新至第 2 集',
  created_at: 1,
  read,
});

/** Deferred replies exercise the production notification controller, not real account acceptance. */
export function NotificationsStateFixture() {
  const current = signal<Account>(account('a'));
  const active = signal(true);
  const reads = signal(0);
  const writes = signal<string[]>([]);
  const pendingReads: {
    scope: NotificationQuery;
    resolve: (value: NotificationSnapshot) => void;
    reject: (error: Error) => void;
  }[] = [];
  const pendingWrites: {
    input: NotificationMarkReadRequest;
    resolve: (value: NotificationSnapshot) => void;
    reject: (error: Error) => void;
  }[] = [];
  let rowRead = false;
  let failRead = false;
  const snapshot = (scope: NotificationQuery): NotificationSnapshot => ({
    ...scope,
    items: rowRead ? [item(true)] : [item(false)],
    unread_count: rowRead ? 0 : 1,
    stale: false,
  });
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, _abort, body) {
      const url = new URL(path, 'http://127.0.0.1:18765');
      if (body !== undefined) {
        const input = body as NotificationMarkReadRequest;
        writes.update((all) => [...all, input.all === true ? 'all' : (input.id ?? 'none')]);
        return new Promise<NotificationSnapshot>((resolve, reject) => {
          pendingWrites.push({ input, resolve, reject });
        });
      }
      if (url.pathname !== '/api/v1/notifications')
        return Promise.reject(new Error('Unexpected notification fixture request'));
      reads.update((value) => value + 1);
      const scope = {
        owner_id: url.searchParams.get('owner_id')!,
        owner_epoch: url.searchParams.get('owner_epoch')!,
      };
      return new Promise<NotificationSnapshot>((resolve, reject) =>
        pendingReads.push({ scope, resolve, reject }),
      );
    },
  });
  const state = createNotificationsState(captureRequest(), current, active);
  const finishRead = (latest = false) => {
    const read = latest ? pendingReads.pop() : pendingReads.shift();
    if (!read) return;
    if (failRead) read.reject(new Error('Synthetic notification read unavailable'));
    else read.resolve(snapshot(read.scope));
  };
  const finishWrite = () => {
    const write = pendingWrites.shift();
    if (!write) return;
    rowRead = true;
    write.resolve(
      snapshot({ owner_id: write.input.owner_id, owner_epoch: write.input.owner_epoch }),
    );
  };
  return (
    <View class="flex-1 bg-background p-6 gap-3">
      <UiText>{`reads:${reads()}`}</UiText>
      <UiText>{`writes:${writes().join(',') || 'none'}`}</UiText>
      <UiText>{`loading:${state.loading()}`}</UiText>
      <UiText>{`stale:${state.stale()}`}</UiText>
      <UiText>{`error:${state.error() || 'none'}`}</UiText>
      <UiText>{`snapshot:${state.snapshot()?.owner_epoch ?? 'none'}`}</UiText>
      <UiText>{`unread:${state.unreadCount() ?? 'none'}`}</UiText>
      <UiText>{`row:${state.snapshot()?.items[0]?.read === true ? 'read' : state.snapshot() ? 'unread' : 'none'}`}</UiText>
      <UiText>{`mutation:${state.mutation()?.state ?? 'none'}`}</UiText>
      <Button label="完成读取" onPress={() => finishRead()} />
      <Button label="完成最新读取" onPress={() => finishRead(true)} />
      <Button label="标为已读" onPress={() => void state.markRead(itemId)} />
      <Button label="全部已读" onPress={() => void state.markAllRead()} />
      <Button label="完成已读写入" onPress={finishWrite} />
      <Button
        label="丢失已读响应"
        onPress={() => pendingWrites.shift()?.reject(new Error('Synthetic lost reply'))}
      />
      <Button label="刷新" onPress={() => void state.refresh()} />
      <Button label="重试" onPress={() => void state.retry()} />
      <Button label="读取失败" onPress={() => (failRead = true)} />
      <Button label="读取恢复" onPress={() => (failRead = false)} />
      <Button label="后台" onPress={() => active.set(false)} />
      <Button label="恢复" onPress={() => active.set(true)} />
      <Button label="切换账号代次" onPress={() => current.set(account('b'))} />
      <Button label="销毁" onPress={state.dispose} />
    </View>
  );
}
