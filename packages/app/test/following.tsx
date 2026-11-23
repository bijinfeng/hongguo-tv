import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';
import type {
  Account,
  Drama,
  FollowItem,
  FollowMutationRequest,
  FollowSnapshot,
} from '@hongguo/core-client';
import { followCaption } from '../src/pages/Following';

// Synthetic service boundaries around the formal App; never real follow acceptance.
const owner = '9007199254740993';
const epoch = 'b'.repeat(32);
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
const drama = (series_id: string, ended = false): Drama => ({
  series_id,
  title: `合成追更作品${series_id}`,
  cover: '',
  intro: '追更边界回归',
  episode_count: 2,
  series_status: ended ? 'ended' : 'ongoing',
});
function fixture(
  signedIn = true,
  rows: FollowItem[] = [{ series_id: '123', drama: drama('123') }],
) {
  let items = rows;
  let reads = 0;
  let readDelay = 0;
  let acceptLogin = false;
  let failRead = false;
  let unknown = false;
  let unconfirmed = false;
  let mutationDelay = 0;
  const writes: FollowMutationRequest[] = [];
  const account: Account = {
    logged_in: signedIn,
    owner_id: signedIn ? owner : '',
    owner_epoch: signedIn ? epoch : 'a'.repeat(32),
    profile: signedIn ? { uid: owner, name: '追更合成账号' } : undefined,
    sync: { state: signedIn ? 'idle' : 'local', pending: 0 },
    qr_login_available: true,
    phone_login_available: true,
  };
  const snapshot = (): FollowSnapshot => ({ owner_id: owner, owner_epoch: epoch, items });
  const network = (request: StubRequest): StubResponse => {
    const url = new URL(request.url);
    if (url.pathname === '/api/v1/account') return ok(account);
    if (url.pathname === '/api/v1/account/command' && acceptLogin) {
      const input = JSON.parse(request.body || '{}');
      expect(input.command.action).toBe('qr_start');
      Object.assign(account, {
        logged_in: true,
        owner_id: owner,
        owner_epoch: epoch,
        profile: { uid: owner, name: '追更合成账号' },
        sync: { state: 'idle', pending: 0 },
      });
      return ok({ account, library: { owner_id: owner, entries: [], favorites: [] } });
    }
    if (url.pathname === '/api/v1/library')
      return ok({ owner_id: account.owner_id, entries: [], favorites: [] });
    if (url.pathname === '/api/v1/account/state')
      return ok({ account, library: { owner_id: account.owner_id, entries: [], favorites: [] } });
    if (url.pathname === '/api/v1/follow') {
      if (request.method !== 'POST') {
        reads++;
        if (failRead)
          return {
            status: 503,
            body: {
              ok: false,
              code: 'ACCOUNT_FOLLOW_UNAVAILABLE',
              error: 'Synthetic read unavailable',
            },
          };
        return { ...ok(snapshot()), delay: readDelay };
      }
      const input = JSON.parse(request.body || '{}') as FollowMutationRequest;
      expect(input.owner_id).toBe(owner);
      expect(input.owner_epoch).toBe(epoch);
      writes.push(input);
      if (unknown) return { error: 'Synthetic lost follow response' };
      if (!unconfirmed) {
        items = input.enabled
          ? [
              ...items.filter((item) => item.series_id !== input.series_id),
              {
                series_id: input.series_id,
                drama: drama(input.series_id, input.series_id === '124'),
              },
            ]
          : items.filter((item) => item.series_id !== input.series_id);
      }
      return {
        ...ok({ ...input, acknowledged: true, confirmed: !unconfirmed, snapshot: snapshot() }),
        delay: mutationDelay,
      };
    }
    if (url.pathname === '/api/v1/search/history' || url.pathname === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (url.pathname === '/api/v1/search') return ok({ items: [drama('123')], has_more: false });
    if (url.pathname === '/api/v1/series/seasons')
      return ok({
        items: [
          { drama: drama('123'), playable: true, upcoming: false, first_video_id: '1231' },
          { drama: drama('124', true), playable: true, upcoming: false, first_video_id: '1241' },
        ],
      });
    if (url.pathname === '/api/v1/series/detail') {
      const id = url.searchParams.get('series_id') || '123';
      return ok({
        ...drama(id, id === '124'),
        episodes: [
          { index: 1, video_id: `${id}1`, locked: false },
          { index: 2, video_id: `${id}2`, locked: false },
        ],
      });
    }
    return { status: 404, body: { ok: false, error: 'Unexpected synthetic follow request' } };
  };
  return {
    account,
    network,
    writes,
    reads: () => reads,
    acceptLogin: () => {
      acceptLogin = true;
    },
    delayRead: (milliseconds: number) => {
      readDelay = milliseconds;
    },
    fail: (value: boolean) => {
      failRead = value;
    },
    lose: (value: boolean) => {
      unknown = value;
    },
    unconfirmed: (value: boolean) => {
      unconfirmed = value;
    },
    delayMutation: (milliseconds: number) => {
      mutationDelay = milliseconds;
    },
  };
}

export function registerFollowingTests(target: 'desktop' | 'tv', entry: string) {
  const start = async (f: ReturnType<typeof fixture>) => {
    const app = await open(entry, {
      width: target === 'tv' ? 1920 : 1440,
      height: 1080,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': f.network, 'POST *': f.network },
    });
    if (target === 'tv') {
      await app.press(`role:button[${f.account.profile?.name || '登录'}]`);
      await app.press('id:account-following');
    } else await app.press('id:nav-following');
    return app;
  };
  test('follow captions use only real optional observations and never infer a schedule from timestamps', () => {
    expect(followCaption({ series_id: '123' })).toBe('');
    expect(
      followCaption({
        series_id: '123',
        follow_update_time: 1700000000,
        has_watched_latest_episode: false,
      }),
    ).toBe('');
    expect(
      followCaption({
        series_id: '123',
        series_status: 'ended',
        latest_watched_episode: 4,
        has_watched_latest_episode: true,
        show_update_frequency: '每周三更新',
      }),
    ).toBe('已完结 · 每周三更新 · 上次看到第 4 集 · 已看到最新集');
  });
  if (target === 'tv')
    test('slow follow entry restores its enabled primary after loading without stealing newer navigation', async () => {
      for (const moved of [false, true]) {
        const f = fixture();
        f.delayRead(1200);
        const app = await start(f);
        await app.wait(80);
        expect(f.reads()).toBe(1);
        if (moved) await app.press('id:nav-home');
        await app.wait(1500);
        await app.keyboard.press('enter');
        await app.wait(80);
        expect(f.reads()).toBe(moved ? 1 : 2);
        expect(f.writes).toEqual([]);
      }
    });
  test('guest follow entrance uses the existing account flow without reads or automatic writes', async () => {
    const f = fixture(false);
    const app = await start(f);
    await app.waitFor('id:following-login');
    expect(f.reads()).toBe(0);
    await app.press('id:following-login');
    await app.waitFor('id:account-login-open');
    expect(f.writes).toEqual([]);
    expect(f.reads()).toBe(0);
  });
  test('guest detail follow requires login and a new explicit exact-series intent after returning', async () => {
    const f = fixture(false, []);
    const app = await open(entry, {
      width: target === 'tv' ? 1920 : 1440,
      height: 1080,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': f.network, 'POST *': f.network },
    });
    await app.press('id:nav-search');
    await app.type('id:search-input', '追更');
    await app.press('id:search-submit');
    await app.waitFor('id:drama-123');
    await app.press('id:drama-123');
    await app.waitUntil(() => app.enabled('id:detail-follow'));
    await app.press('id:detail-follow');
    await app.waitFor('id:account-login-open');
    expect(f.reads()).toBe(0);
    expect(f.writes).toEqual([]);
    f.acceptLogin();
    await app.press('id:account-login-open');
    await app.press('获取登录二维码');
    await app.waitFor('id:account-logout');
    await app.back();
    await app.waitUntil(() => app.enabled('id:detail-follow'));
    expect(f.writes).toEqual([]);
    await app.press('id:detail-follow');
    await app.waitFor('id:detail-follow >> text:已追更');
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([['123', true]]);
  });
  test('unavailable follow members stay cancellable without a fake detail and confirmed removal focuses a surviving action', async () => {
    const f = fixture(true, [
      { series_id: '9007199254740992' },
      { series_id: '123', drama: drama('123') },
    ]);
    const app = await start(f);
    await app.waitFor('id:following-cancel-9007199254740992');
    expect(app.shows('id:following-open-9007199254740992')).toBe(false);
    await app.press('id:following-cancel-9007199254740992');
    await app.waitFor('id:following-row-9007199254740992', { state: 'gone' });
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('暂时没有追更。');
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([
      ['9007199254740992', false],
      ['123', false],
    ]);
    expect(app.requests().some(({ url }) => url.includes('/series/detail'))).toBe(false);
    await app.wait(80);
    await app.keyboard.press('enter');
    // One destination, one name on every host.
    await app.waitFor('role:header[找剧]');
  });
  test('failed follow refresh retains the previous list as stale and retry reads without posting', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:following-open-123');
    f.fail(true);
    await app.press('id:following-refresh');
    await app.waitFor('id:following-state');
    expect(app.shows('id:following-open-123')).toBe(true);
    expect(app.enabled('id:following-cancel-123')).toBe(false);
    expect(app.shows('暂时没有追更。')).toBe(false);
    f.fail(false);
    await app.press('id:following-state >> role:button[刷新状态]');
    await app.waitUntil(() => app.enabled('id:following-cancel-123'));
    expect(f.writes).toEqual([]);
  });
  test('a delayed follow cancellation cannot steal focus from a newer detail visit and return', async () => {
    const f = fixture(true, [
      { series_id: '123', drama: drama('123') },
      { series_id: '124', drama: drama('124', true), series_status: 'ended' },
    ]);
    const app = await start(f);
    await app.waitFor('id:following-cancel-123');
    f.delayMutation(1000);
    await app.press('id:following-cancel-123');
    expect(f.writes.length).toBe(1);
    expect(app.enabled('id:following-cancel-124')).toBe(false);
    await app.press('id:following-open-124');
    await app.waitFor('id:detail-follow');
    await app.back();
    await app.waitFor('id:following-open-124');
    // Ensure the newer source returned before the older reply can restore focus.
    expect(app.shows('id:following-row-123')).toBe(true);
    await app.waitFor('id:following-row-123', { state: 'gone' });
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('id:detail-follow');
    await app.waitFor('合成追更作品124');
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([
      ['123', false],
    ]);
    expect(
      app.requests().some(({ method, url }) => method === 'POST' && url.includes('/library')),
    ).toBe(false);
  });
  test('initial follow failure stays distinct from a successful empty list', async () => {
    const f = fixture();
    f.fail(true);
    const app = await start(f);
    await app.waitFor('id:following-state');
    expect(app.shows('暂时没有追更。')).toBe(false);
    expect(app.shows('id:following-empty-discover')).toBe(false);
    expect(app.shows('id:following-list')).toBe(false);
    f.fail(false);
    await app.press('id:following-state >> role:button[刷新状态]');
    await app.waitFor('id:following-open-123');
    expect(f.writes).toEqual([]);
  });
  test('lost follow replies retain confirmed membership and only explicit recovery retries the original absolute target', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:following-cancel-123');
    f.lose(true);
    await app.press('id:following-cancel-123');
    await app.waitFor('id:following-state-retry');
    expect(app.shows('id:following-row-123')).toBe(true);
    await app.wait(1500);
    expect(f.writes.length).toBe(1);
    f.lose(false);
    await app.press('id:following-state-retry');
    await app.waitFor('暂时没有追更。');
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([
      ['123', false],
      ['123', false],
    ]);
  });
  test('detail uses the selected exact series and completed members remain cancellable without offering new follows', async () => {
    const f = fixture(true, [
      { series_id: '123', drama: drama('123') },
      { series_id: '124', drama: drama('124', true), series_status: 'ended' },
    ]);
    const app = await start(f);
    await app.waitFor('id:following-open-123');
    await app.press('id:following-open-123');
    await app.waitFor('id:detail-follow');
    await app.press('id:season-124');
    await app.waitUntil(() => app.enabled('id:detail-follow'));
    await app.press('id:detail-follow');
    await app.waitFor('已完结');
    expect(app.enabled('id:detail-follow')).toBe(false);
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([
      ['124', false],
    ]);
    expect(
      app.requests().filter(({ method, url }) => method === 'POST' && !url.includes('/follow')),
    ).toEqual([]);
  });
  test('acknowledged follow without matching observation stays unconfirmed and refresh never silently replays it', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:following-cancel-123');
    f.unconfirmed(true);
    await app.press('id:following-cancel-123');
    await app.waitFor('请求已提交，追更结果待确认。');
    expect(app.shows('id:following-row-123')).toBe(true);
    await app.press('id:following-state >> role:button[刷新状态]');
    await app.wait(800);
    expect(f.writes.length).toBe(1);
    expect(app.shows('id:following-state-retry')).toBe(true);
  });
  test('a recycled follow source removed in details returns to a surviving neighbor without creating viewing progress', async () => {
    const f = fixture(true, [
      ...Array.from({ length: 30 }, (_, index) => ({
        series_id: String(8000 + index),
        drama: drama(String(8000 + index)),
      })),
      { series_id: '123', drama: drama('123') },
    ]);
    const app = await start(f);
    await app.waitFor('id:following-list');
    await app.scroll('id:following-list', 16000);
    await app.waitFor('id:following-open-123');
    await app.scroll('id:following-list', 600);
    await app.press('id:following-open-123');
    await app.waitUntil(() => app.enabled('id:detail-follow'));
    await app.press('id:detail-follow');
    await app.waitFor('id:detail-follow >> text:追更');
    await app.back();
    await app.waitFor('id:following-open-8029');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('合成追更作品8029');
    expect(f.writes.map(({ series_id, enabled }) => [series_id, enabled])).toEqual([
      ['123', false],
    ]);
    expect(
      app.requests().some(({ method, url }) => method === 'POST' && url.includes('/library')),
    ).toBe(false);
  });
}
