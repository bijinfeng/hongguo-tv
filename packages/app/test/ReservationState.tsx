import { View, signal } from 'nsh';
import { Button, UiText } from '@hongguo/ui';
import {
  captureRequest,
  configureTransport,
  type Account,
  type ReservationItem,
  type ReservationMutationRequest,
  type ReservationMutationResult,
  type ReservationQuery,
  type ReservationSnapshot,
} from '@hongguo/core-client';
import { createReservationState } from '../src/reservation-state';

const owner = '9007199254740993';
const id = '9007199254740995';
const item: ReservationItem = {
  reservation_id: id,
  series_id: '123',
  online: false,
  title: '合成预约',
  cover: '',
  cover_fallback: '',
  intro: '',
  tags: [],
};
const account = (epoch: string): Account => ({
  logged_in: true,
  owner_id: owner,
  owner_epoch: epoch.repeat(32),
  sync: { state: 'idle', pending: 0 },
  qr_login_available: true,
  phone_login_available: true,
});

/** Deferred synthetic replies exercise the production controller, not real reservation acceptance. */
export function ReservationStateFixture() {
  const current = signal<Account>(account('a'));
  const active = signal(true);
  const reads = signal(0);
  const writes = signal<string[]>([]);
  const pendingReads: { scope: ReservationQuery; resolve: (value: ReservationSnapshot) => void }[] =
    [];
  const pendingWrites: {
    input: ReservationMutationRequest;
    resolve: (value: ReservationMutationResult) => void;
    reject: (error: Error) => void;
  }[] = [];
  let rows = [item];
  const snapshot = (scope: ReservationQuery): ReservationSnapshot => ({ ...scope, items: rows });
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    request(path, _abort, body) {
      if (body !== undefined) {
        const input = body as ReservationMutationRequest;
        writes.update((all) => [
          ...all,
          `${input.target.kind}:${input.target.id}:${input.enabled}`,
        ]);
        return new Promise<ReservationMutationResult>((resolve, reject) => {
          pendingWrites.push({ input, resolve, reject });
        });
      }
      const url = new URL(path, 'http://127.0.0.1:18765');
      const scope = {
        owner_id: url.searchParams.get('owner_id')!,
        owner_epoch: url.searchParams.get('owner_epoch')!,
      };
      reads.update((value) => value + 1);
      return new Promise<ReservationSnapshot>((resolve) => pendingReads.push({ scope, resolve }));
    },
  });
  const state = createReservationState(captureRequest(), current, active);
  const finishRead = (latest = false) => {
    const read = latest ? pendingReads.pop() : pendingReads.shift();
    if (read) read.resolve(snapshot(read.scope));
  };
  const finishWrite = (confirmed: boolean) => {
    const write = pendingWrites.shift();
    if (!write) return;
    if (confirmed) {
      rows = write.input.enabled
        ? [{ ...item, ...(write.input.target.kind === 'series' ? { series_id: id } : {}) }]
        : [];
    }
    write.resolve({
      ...write.input,
      acknowledged: true,
      confirmed,
      snapshot: snapshot({ owner_id: write.input.owner_id, owner_epoch: write.input.owner_epoch }),
    });
  };
  return (
    <View class="flex-1 bg-background p-6 gap-3">
      <UiText>{`reads:${reads()}`}</UiText>
      <UiText>{`writes:${writes().join(',')}`}</UiText>
      <UiText>{`loading:${state.loading()}`}</UiText>
      <UiText>{`stale:${state.stale()}`}</UiText>
      <UiText>{`snapshot:${state.snapshot()?.owner_epoch ?? 'none'}`}</UiText>
      <UiText>{`item:${String(state.membership({ kind: 'item', id }))}`}</UiText>
      <UiText>{`series:${String(state.membership({ kind: 'series', id }))}`}</UiText>
      <UiText>{`mutation:${state.mutation()?.state ?? 'none'}`}</UiText>
      <Button label="完成最早读取" onPress={() => finishRead()} />
      <Button label="完成最新读取" onPress={() => finishRead(true)} />
      <Button label="取消项目" onPress={() => void state.set({ kind: 'item', id }, false)} />
      <Button label="预约季" onPress={() => void state.set({ kind: 'series', id }, true)} />
      <Button label="完成确认写入" onPress={() => finishWrite(true)} />
      <Button label="完成未确认写入" onPress={() => finishWrite(false)} />
      <Button
        label="丢失响应"
        onPress={() => pendingWrites.shift()?.reject(new Error('Synthetic lost reply'))}
      />
      <Button label="刷新" onPress={() => void state.refresh()} />
      <Button label="重试" onPress={() => void state.retry()} />
      <Button label="后台" onPress={() => active.set(false)} />
      <Button label="恢复" onPress={() => active.set(true)} />
      <Button label="切换账号代次" onPress={() => current.set(account('b'))} />
      <Button
        label="缺少关联身份"
        onPress={() => {
          rows = [{ ...item, series_id: undefined }];
        }}
      />
      <Button
        label="已上线"
        onPress={() => {
          rows = [{ ...item, online: true }];
        }}
      />
      <Button label="销毁" onPress={state.dispose} />
    </View>
  );
}
