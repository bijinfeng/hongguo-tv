import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';
import type {
  Account,
  AccountCommandRequest,
  AccountCommandResult,
  AccountLogin,
  Library,
} from '@hongguo/core-client';

// Synthetic service responses exercise the production App/store only; never functional acceptance.
const guestEpoch = 'a'.repeat(32);
const accountEpoch = 'b'.repeat(32);
const accountId = '9007199254740993';
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
const guest = (owner_epoch = guestEpoch): Account => ({
  logged_in: false,
  sync: { state: 'local', pending: 0 },
  owner_id: '',
  owner_epoch,
  qr_login_available: true,
  phone_login_available: true,
});
const library = (owner_id = ''): Library => ({
  owner_id,
  favorites: [],
  entries: [
    {
      drama: {
        series_id: owner_id ? '202' : '101',
        title: owner_id ? '账号记录' : '游客记录',
        cover: '',
        intro: '合成账号隔离回归',
        episode_count: 1,
      },
      episode: 1,
      video_id: owner_id ? '402' : '401',
      position: 12,
      duration: 100,
      last_played_at: 1,
    },
  ],
});
const qr = (): AccountLogin => ({
  id: 'synthetic-qr',
  method: 'qr',
  state: 'pending',
  expires_at: Number.MAX_SAFE_INTEGER,
});
const phone = (): AccountLogin => ({
  id: 'synthetic-phone',
  method: 'phone',
  state: 'pending',
  expires_at: Number.MAX_SAFE_INTEGER,
  phone: '+86 138****8000',
});
function accountFixture(
  command: (
    input: AccountCommandRequest,
    state: {
      account: Account;
      library: Library;
    },
  ) => StubResponse,
) {
  const state = { account: guest(), library: library() };
  const commands: AccountCommandRequest[] = [];
  let recoveries = 0;
  const network = (request: StubRequest): StubResponse => {
    const path = new URL(request.url).pathname;
    if (path === '/api/v1/account') return ok(state.account);
    if (path === '/api/v1/library') return ok(state.library);
    if (path === '/api/v1/account/state') {
      recoveries++;
      return ok(state satisfies AccountCommandResult);
    }
    if (path === '/api/v1/account/command') {
      const input = JSON.parse(request.body || '{}') as AccountCommandRequest;
      commands.push(input);
      expect(input.owner_id).toBe(state.account.owner_id);
      expect(input.owner_epoch).toBe(state.account.owner_epoch);
      return command(input, state);
    }
    if (path === '/api/v1/search/history' || path === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (path === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (path === '/api/v1/search') return ok({ items: [], has_more: false });
    return { status: 404, body: { ok: false, error: 'Unexpected synthetic account request' } };
  };
  return { state, commands, network, recoveries: () => recoveries };
}
const signedIn = (): Account => ({
  logged_in: true,
  sync: { state: 'local', pending: 0 },
  owner_id: accountId,
  owner_epoch: accountEpoch,
  profile: { uid: accountId, name: '集成账号' },
  qr_login_available: true,
  phone_login_available: true,
});

export function registerAccountTests(target: 'desktop' | 'tv' = 'desktop', entry = './App.tsx') {
  const dimensions = {
    width: target === 'tv' ? 1920 : 1440,
    height: target === 'tv' ? 1080 : 1000,
  };

  test('synthetic account App QR buttons poll real shared state and show failures without starting another attempt', async () => {
    let polls = 0;
    const fixture = accountFixture(({ command }, state) => {
      if (command.action === 'qr_start') state.account = { ...guest(), login: qr() };
      else if (command.action === 'qr_poll') {
        if (++polls === 2)
          return {
            status: 503,
            body: { ok: false, code: 'UPSTREAM_UNAVAILABLE', error: '合成扫码轮询失败' },
          };
        state.account = { ...guest(), login: { ...qr(), state: 'scanned' } };
      } else if (command.action === 'cancel') state.account = guest();
      else return { status: 400, body: { ok: false, error: 'Unexpected account action' } };
      return ok(state);
    });
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.waitFor('id:nav-history');
    await app.press(target === 'tv' ? '账号' : '登录');
    await app.waitFor('id:account-login-open');
    await app.press('id:account-login-open');
    await app.waitFor('id:account-login-dialog');
    await app.waitFor('id:account-qr-start');
    await app.wait(80);
    expect(fixture.commands).toEqual([]);
    await app.press('id:account-qr-start');
    await app.waitFor('请用红果短剧 App 扫码');
    await app.wait(1800);
    await app.waitFor('已扫码，请在手机上确认');
    await app.wait(1800);
    await app.waitFor('合成扫码轮询失败');
    await app.wait(4000);
    expect(fixture.commands.map(({ command }) => command.action)).toEqual([
      'qr_start',
      'qr_poll',
      'qr_poll',
    ]);
    expect(fixture.recoveries()).toBe(1);
    await app.press('id:account-login-dialog >> role:button[关闭]');
    await app.waitUntil(() => !app.shows('id:account-login-dialog'));
    await app.waitUntil(() => app.enabled('id:account-login-open'));
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('id:account-login-dialog');
    await app.keyboard.press('escape');
    await app.waitUntil(() => !app.shows('id:account-login-dialog'));
    await app.press('id:nav-history');
    await app.waitFor('id:history-101');
    expect(app.shows('id:history-202')).toBe(false);
  });

  test('synthetic account App existing-code login requires explicit MFA and restores separate guest history after logout', async () => {
    const fixture = accountFixture(({ command }, state) => {
      if (command.action === 'phone_start') {
        expect(command.send_code).toBe(false);
        expect(command.country_code).toBe('+86');
        expect(command.phone).toBe('13800138000');
        state.account = { ...guest(), login: phone() };
      } else if (command.action === 'phone_login') {
        expect(command.code).toBe('123456');
        state.account = {
          ...guest(),
          login: { ...phone(), state: 'mfa', sms_number: '1069', sms_content: 'HG 123456' },
        };
      } else if (command.action === 'phone_verify') {
        state.account = signedIn();
        state.library = library(accountId);
      } else if (command.action === 'logout') {
        state.account = guest('c'.repeat(32));
        state.library = library();
      } else if (command.action === 'cancel') state.account = guest();
      else return { status: 400, body: { ok: false, error: 'Unexpected account action' } };
      return ok(state);
    });
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      colorScheme: 'dark',
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(target === 'tv' ? '账号' : '登录');
    await app.waitFor('id:account-login-open');
    await app.press('id:account-login-open');
    await app.waitFor('id:account-login-dialog');
    await app.waitFor('id:account-method-phone');
    await app.wait(80);
    await app.press('id:account-method-phone');
    if (target === 'tv') {
      await app.press('id:account-phone-activate');
      await app.wait(80);
    }
    await app.type('id:account-phone', '13800138000');
    if (target === 'tv') await app.keyboard.press('escape');
    expect(fixture.commands).toEqual([]);
    await app.press('id:account-existing-code');
    await app.waitFor('输入验证码后登录');
    if (target === 'tv') {
      await app.press('id:account-code-activate');
      await app.wait(80);
    }
    await app.type('id:account-code', '123456');
    if (target === 'tv') await app.keyboard.press('escape');
    await app.press('id:account-phone-login');
    await app.waitFor('HG 123456');
    await app.wait(4000);
    expect(fixture.commands.map(({ command }) => command.action)).toEqual([
      'phone_start',
      'phone_login',
    ]);
    await app.press('id:account-phone-verify');
    await app.waitFor('id:account-logout');
    await app.waitUntil(() => !app.shows('id:account-login-dialog'));
    await app.press('id:nav-history');
    await app.waitFor('id:history-202');
    expect(app.shows('id:history-101')).toBe(false);
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.waitFor('id:account-logout');
    await app.press('id:account-logout');
    await app.waitFor('id:account-login-open');
    await app.press('id:nav-history');
    await app.waitFor('id:history-101');
    expect(app.shows('id:history-202')).toBe(false);
    const logout = fixture.commands.find(({ command }) => command.action === 'logout');
    expect(logout?.owner_id).toBe(accountId);
    expect(logout?.owner_epoch).toBe(accountEpoch);
    expect(
      fixture.commands.some(({ command }) => command.action === 'phone_start' && command.send_code),
    ).toBe(false);
  });

  test('synthetic account App reconciles a lost login response from authoritative account/library state', async () => {
    const fixture = accountFixture(({ command }, state) => {
      if (command.action === 'qr_start') state.account = { ...guest(), login: qr() };
      else if (command.action === 'qr_poll') {
        state.account = signedIn();
        state.library = library(accountId);
        return { error: 'synthetic committed response lost' };
      } else if (command.action === 'cancel') state.account = guest();
      else return { status: 400, body: { ok: false, error: 'Unexpected account action' } };
      return ok(state);
    });
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(target === 'tv' ? '账号' : '登录');
    await app.waitFor('id:account-login-open');
    await app.press('id:account-login-open');
    await app.waitFor('id:account-login-dialog');
    await app.waitFor('id:account-qr-start');
    await app.wait(80);
    await app.press('id:account-qr-start');
    await app.waitFor('请用红果短剧 App 扫码');
    await app.wait(1800);
    await app.waitFor('id:account-logout');
    await app.waitUntil(() => !app.shows('id:account-login-dialog'));
    expect(fixture.recoveries()).toBe(1);
    await app.press('id:nav-history');
    await app.waitFor('id:history-202');
    expect(app.shows('id:history-101')).toBe(false);
    expect(fixture.commands.map(({ command }) => command.action)).toEqual(['qr_start', 'qr_poll']);
  });
  test('synthetic account library sync keeps readable records after failure and retries explicitly', async () => {
    let attempts = 0;
    const fixture = accountFixture(({ command }, state) => {
      expect(command.action).toBe('sync');
      if (++attempts === 1) {
        state.account = {
          ...state.account,
          sync: { state: 'error', pending: 1, error: '合成同步失败' },
        };
        return {
          status: 502,
          body: { ok: false, error: '合成同步失败', code: 'ACCOUNT_UPSTREAM' },
        };
      }
      state.account = { ...state.account, sync: { state: 'idle', pending: 0, last_sync: 1 } };
      return ok(state);
    });
    fixture.state.account = { ...signedIn(), sync: { state: 'pending', pending: 1 } };
    fixture.state.library = library(accountId);
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.waitFor('id:account-sync');
    expect(fixture.commands.length).toBe(0);
    await app.press('id:account-sync');
    await app.waitFor('合成同步失败');
    expect(app.shows('id:account-history')).toBe(true);
    expect(fixture.commands.length).toBe(1);
    await app.waitUntil(() => app.enabled('id:account-sync'));
    await app.press('id:account-sync');
    await app.waitFor('已同步');
    expect(fixture.commands.length).toBe(2);
    await app.press('id:account-history');
    await app.waitFor('id:history-202');
    app.dispose();
  });

  test('synthetic account import defaults to cancel and shows partial original counts without merging favorites', async () => {
    const fixture = accountFixture(({ command }, state) => {
      expect(command.action).toBe('import_guest_history');
      state.account = {
        ...state.account,
        guest_history: { total: 2, available: 1 },
        sync: { state: 'pending', pending: 1 },
      };
      state.library = {
        ...state.library,
        entries: [...state.library.entries, ...library().entries],
      };
      return ok({ ...state, import_history: { imported: 1, remaining: 1 } });
    });
    fixture.state.account = { ...signedIn(), guest_history: { total: 2, available: 2 } };
    fixture.state.library = library(accountId);
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.press('id:account-import-open');
    await app.waitFor('id:account-import-cancel');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitUntil(() => !app.shows('id:account-import'));
    expect(fixture.commands.length).toBe(0);
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('id:account-import');
    await app.keyboard.press('escape');
    await app.waitUntil(() => !app.shows('id:account-import'));
    await app.press('id:account-import-open');
    await app.waitFor('id:account-import-confirm');
    await app.press('id:account-import-confirm');
    await app.waitFor('已合并 1 条记录，还剩 1 条可合并。');
    expect(fixture.commands.length).toBe(1);
    expect(fixture.state.library.favorites).toEqual([]);
    expect(app.shows('合并登录前观看记录（1）')).toBe(true);
    await app.press('id:account-history');
    await app.waitFor('id:history-101');
    app.dispose();
  });

  test('synthetic account import lost response reconciles state without inventing completion counts', async () => {
    const fixture = accountFixture(({ command }, state) => {
      expect(command.action).toBe('import_guest_history');
      state.account = { ...state.account, guest_history: { total: 1, available: 0 } };
      state.library = {
        ...state.library,
        entries: [...state.library.entries, ...library().entries],
      };
      return { error: 'synthetic import response lost' };
    });
    fixture.state.account = { ...signedIn(), guest_history: { total: 1, available: 1 } };
    fixture.state.library = library(accountId);
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.press('id:account-import-open');
    await app.waitFor('id:account-import-confirm');
    await app.press('id:account-import-confirm');
    await app.waitFor('合并结果未确认，已重新读取片库。');
    expect(app.shows('已合并 1 条记录。')).toBe(false);
    expect(app.shows('id:account-import-open')).toBe(false);
    expect(fixture.commands.length).toBe(1);
    await app.press('id:account-history');
    await app.waitFor('id:history-101');
    app.dispose();
  });

  test('synthetic account owner change during import closes old confirmation without focusing the new library entry', async () => {
    const fixture = accountFixture(({ command }, state) => {
      expect(command.action).toBe('import_guest_history');
      state.account = {
        ...state.account,
        owner_epoch: 'c'.repeat(32),
        guest_history: { total: 1, available: 0 },
      };
      return {
        status: 409,
        body: { ok: false, code: 'ACCOUNT_OWNER_CHANGED', error: '合成账号会话已变化' },
      };
    });
    fixture.state.account = { ...signedIn(), guest_history: { total: 1, available: 1 } };
    fixture.state.library = library(accountId);
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.press('id:account-import-open');
    await app.waitFor('id:account-import');
    await app.press('id:account-import-confirm');
    await app.waitFor('id:account-import', { state: 'gone' });
    await app.wait(80);
    await app.keyboard.press('enter');
    expect(app.shows('id:account-history')).toBe(true);
    expect(app.shows('id:history-page')).toBe(false);
    expect(fixture.commands.length).toBe(1);
    expect(fixture.recoveries()).toBe(1);
    expect(app.shows('已合并 1 条记录。')).toBe(false);
  });

  test('synthetic import completion after dismissing cannot steal focus from a newer library choice', async () => {
    const fixture = accountFixture(({ command }, state) => {
      expect(command.action).toBe('import_guest_history');
      state.account = { ...state.account, guest_history: { total: 1, available: 0 } };
      state.library = {
        ...state.library,
        entries: [...state.library.entries, ...library().entries],
      };
      return { ...ok({ ...state, import_history: { imported: 1, remaining: 0 } }), delay: 500 };
    });
    fixture.state.account = { ...signedIn(), guest_history: { total: 1, available: 1 } };
    fixture.state.library = library(accountId);
    const app = await open(entry, {
      ...dimensions,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': fixture.network, 'POST *': fixture.network },
    });
    await app.press(
      target === 'desktop' ? 'label:账号与记录 >> role:button[集成账号]' : 'role:button[集成账号]',
    );
    await app.press('id:account-import-open');
    await app.press('id:account-import-confirm');
    await app.waitFor('关闭');
    await app.press('id:account-import-cancel');
    await app.press('id:account-favorites');
    await app.waitFor('收藏的短剧会保存在这里。');
    await app.wait(600);
    await app.keyboard.press('enter');
    expect(app.shows('收藏的短剧会保存在这里。')).toBe(true);
    expect(app.shows('id:account-import')).toBe(false);
    expect(fixture.commands.length).toBe(1);
  });
}
