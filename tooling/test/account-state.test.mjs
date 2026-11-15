import assert from 'node:assert/strict';
import test from 'node:test';
import { accountCountries, createAccountState } from '../../packages/app/src/account-state.ts';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function fixture(handler) {
  let time = 100_000;
  let serial = 0;
  let account = {
    logged_in: false,
    sync: { state: 'local', pending: 0 },
    owner_id: '',
    qr_login_available: true,
    phone_login_available: true,
  };
  const calls = [];
  const timers = new Map();
  const flow = createAccountState({
    account: () => account,
    now: () => time,
    schedule: (work, delay) => {
      const id = ++serial;
      timers.set(id, { work, at: time + delay });
      return id;
    },
    clear: (id) => timers.delete(id),
    onChange: () => {},
    command: async (command, abort) => {
      calls.push({ command, abort });
      const result = await handler(command, abort, account);
      if (!abort?.aborted) account = result;
      return result;
    },
  });
  return {
    flow,
    calls,
    timers,
    account: () => account,
    async advance(ms) {
      const until = time + ms;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        time = next[1].at;
        timers.delete(next[0]);
        next[1].work();
        await settle();
      }
      time = until;
      await settle();
    },
  };
}
const qr = (id = 'qr-1', extra = {}) => ({
  id,
  method: 'qr',
  state: 'pending',
  expires_at: 180_000,
  image: 'data:image/png;base64,verified',
  ...extra,
});
const phone = (extra = {}) => ({
  id: 'phone-1',
  method: 'phone',
  state: 'code_sent',
  expires_at: 180_000,
  ...extra,
});

test('QR polls every 1800 ms, reports core errors, and never auto-generates an attempt', async () => {
  let polls = 0;
  const f = fixture(async (command, _abort, account) => ({
    ...account,
    login: qr(
      'qr-1',
      command.action === 'qr_poll'
        ? ++polls === 1
          ? { state: 'scanned' }
          : { state: 'failed', error: '扫码验证失败' }
        : {},
    ),
  }));
  assert.equal(f.calls.length, 0);
  await f.flow.startQr();
  await f.advance(1799);
  assert.equal(f.calls.length, 1);
  await f.advance(1);
  assert.equal(f.flow.state().login.state, 'scanned');
  await f.advance(1800);
  assert.equal(f.flow.state().error, '扫码验证失败');
  await f.advance(10_000);
  assert.equal(f.calls.length, 3);
  f.flow.dispose();
});

test('refresh, method changes, background and dispose fence late responses and cancel known attempts separately', async () => {
  for (const stop of ['method', 'background', 'dispose']) {
    const result = deferred();
    const f = fixture(async (command, _abort, account) => {
      if (command.action === 'qr_poll') return result.promise;
      return { ...account, login: command.action === 'cancel' ? undefined : qr() };
    });
    await f.flow.startQr();
    await f.advance(1800);
    const old = f.calls[1].abort;
    if (stop === 'method') f.flow.setMethod('phone');
    else if (stop === 'background') f.flow.setActive(false);
    else f.flow.dispose();
    assert.equal(old.aborted, true);
    await settle();
    assert.deepEqual(f.calls[2].command, { action: 'cancel', id: 'qr-1' });
    assert.equal(f.calls[2].abort, undefined);
    result.resolve({ ...f.account(), logged_in: true, owner_id: '123' });
    await settle();
    assert.equal(f.account().logged_in, false);
    assert.equal(f.flow.state().login, undefined);
    assert.equal(f.timers.size, 0);
  }
});

test('a stale start response cannot install or poll a new attempt after refresh', async () => {
  const first = deferred();
  let starts = 0;
  const f = fixture(async (_command, _abort, account) =>
    ++starts === 1 ? first.promise : { ...account, login: qr('new') },
  );
  const pending = f.flow.startQr();
  await settle();
  const cancelled = f.flow.cancel();
  await cancelled;
  await f.flow.startQr();
  first.resolve({ ...f.account(), login: qr('old') });
  await pending;
  assert.equal(f.flow.state().login.id, 'new');
  await f.advance(1800);
  assert.equal(f.calls.at(-1).command.id, 'new');
  f.flow.dispose();
});

test('phone numbers use 14 real region bounds; SMS is sent only by the explicit send action', async () => {
  const f = fixture(async (command, _abort, account) => ({
    ...account,
    login: command.action === 'cancel' ? undefined : phone(),
  }));
  assert.equal(accountCountries.length, 14);
  f.flow.setMethod('phone');
  f.flow.setPhone('123');
  await f.flow.sendCode();
  assert.equal(f.calls.length, 0);
  f.flow.setPhone('13800138000');
  assert.equal(f.calls.length, 0);
  await f.flow.useExistingCode();
  assert.deepEqual(f.calls.at(-1).command, {
    action: 'phone_start',
    country_code: '+86',
    phone: '13800138000',
    send_code: false,
  });
  await f.flow.sendCode();
  assert.equal(f.calls.at(-1).command.send_code, true);
  f.flow.setCode('12');
  await f.flow.submit();
  assert.equal(f.calls.at(-1).command.action, 'phone_start');
  f.flow.setCode('123456');
  await f.flow.submit();
  assert.deepEqual(f.calls.at(-1).command, {
    action: 'phone_login',
    id: 'phone-1',
    code: '123456',
  });
  f.flow.dispose();
});

test('cooldown keeps elapsed time across method changes and expires_at is Unix milliseconds', async () => {
  const f = fixture(async (command, _abort, account) => ({
    ...account,
    login: command.action === 'cancel' ? undefined : phone({ retry_after: 3, expires_at: 104_000 }),
  }));
  f.flow.setMethod('phone');
  f.flow.setPhone('13800138000');
  await f.flow.sendCode();
  assert.equal(f.flow.state().retryIn, 3);
  await f.flow.sendCode();
  assert.equal(f.calls.length, 1);
  f.flow.setMethod('qr');
  await f.advance(3000);
  assert.equal(f.flow.state().retryIn, 0);
  f.flow.setMethod('phone');
  await f.flow.useExistingCode();
  await f.advance(1000);
  assert.equal(f.flow.state().expired, true);
  assert.equal(f.calls.at(-1).command.action, 'cancel');
  f.flow.dispose();
});

test('upstream SMS verification requires an explicit query and failed input remains editable', async () => {
  const f = fixture(async (command, _abort, account) => {
    if (command.action === 'phone_login')
      return {
        ...account,
        login: phone({ state: 'mfa', sms_number: '1069', sms_content: 'verify' }),
      };
    if (command.action === 'phone_verify') throw new Error('尚未收到短信');
    return { ...account, login: phone() };
  });
  f.flow.setMethod('phone');
  f.flow.setPhone('13800138000');
  await f.flow.useExistingCode();
  f.flow.setCode('123456');
  await f.flow.submit();
  assert.equal(f.flow.state().login.state, 'mfa');
  await f.advance(5000);
  assert.equal(f.calls.length, 2);
  await f.flow.verify();
  assert.equal(f.flow.state().error, '尚未收到短信');
  assert.equal(f.flow.state().phone, '13800138000');
  assert.equal(f.flow.state().code, '123456');
  f.flow.dispose();
});

test('a lost cancellation remains a barrier until the exact old attempt is explicitly confirmed', async () => {
  let cancellations = 0;
  const f = fixture(async (command, _abort, account) => {
    if (command.action === 'cancel') {
      if (++cancellations === 1) throw new Error('取消结果未确认');
      return { ...account, login: undefined };
    }
    return { ...account, login: qr(`qr-${f.calls.length}`) };
  });
  await f.flow.startQr();
  await f.flow.startQr();
  assert.equal(f.calls.length, 2);
  assert.equal(f.flow.state().error, '取消结果未确认');
  assert.equal(f.flow.state().busy, false);
  await f.flow.startQr();
  assert.deepEqual(f.calls[2].command, { action: 'cancel', id: 'qr-1' });
  assert.equal(f.calls[3].command.action, 'qr_start');
  f.flow.dispose();
});

test('background cooldown resumes from elapsed wall time and inactive actions cannot leave busy state stuck', async () => {
  const f = fixture(async (command, _abort, account) => ({
    ...account,
    login: command.action === 'cancel' ? undefined : phone({ retry_after: 3 }),
  }));
  f.flow.setMethod('phone');
  f.flow.setPhone('13800138000');
  await f.flow.sendCode();
  f.flow.setActive(false);
  await settle();
  await f.flow.startQr();
  assert.equal(f.flow.state().busy, false);
  await f.advance(10_000);
  f.flow.setActive(true);
  assert.equal(f.flow.state().retryIn, 0);
  await f.flow.sendCode();
  assert.equal(f.calls.at(-1).command.send_code, true);
  f.flow.dispose();
});
