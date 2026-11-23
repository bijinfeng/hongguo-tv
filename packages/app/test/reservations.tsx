import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';
import type {
  Account,
  Drama,
  ReservationItem,
  ReservationMutationRequest,
  ReservationSnapshot,
} from '@hongguo/core-client';
import { reservationItemId, reservationPublishLabel } from '../src/pages/Reservations';

// Synthetic boundaries around the formal App; never evidence of real account acceptance.
const owner = '9007199254740993';
const epoch = 'c'.repeat(32);
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
const drama = (series_id: string): Drama => ({
  series_id,
  title: `合成预约作品${series_id}`,
  cover: '',
  intro: '预约边界回归',
  episode_count: 2,
  series_status: 'ongoing',
});
const upcoming = (id: string): ReservationItem => ({
  reservation_id: id,
  online: false,
  title: `合成待上线${id}`,
  cover: '',
  cover_fallback: '',
  intro: '未上线的真实字段结构',
  publish_text: '上线时间待定',
  tags: ['都市'],
});
const online = (id: string, series_id: string): ReservationItem => ({
  reservation_id: id,
  series_id,
  online: true,
  drama: drama(series_id),
  title: drama(series_id).title,
  cover: '',
  cover_fallback: '',
  intro: '已上线的真实字段结构',
  tags: [],
});
function fixture(
  signedIn = true,
  rows: ReservationItem[] = [upcoming('777'), online('400', '123')],
) {
  let items = rows;
  let reads = 0;
  let failRead = false;
  let acceptLogin = false;
  let unknown = false;
  let unconfirmed = false;
  let mutationDelay = 0;
  const writes: ReservationMutationRequest[] = [];
  const account: Account = {
    logged_in: signedIn,
    owner_id: signedIn ? owner : '',
    owner_epoch: signedIn ? epoch : 'a'.repeat(32),
    profile: signedIn ? { uid: owner, name: '预约合成账号' } : undefined,
    sync: { state: signedIn ? 'idle' : 'local', pending: 0 },
    qr_login_available: true,
    phone_login_available: true,
  };
  const snapshot = (): ReservationSnapshot => ({ owner_id: owner, owner_epoch: epoch, items });
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
        profile: { uid: owner, name: '预约合成账号' },
        sync: { state: 'idle', pending: 0 },
      });
      return ok({ account, library: { owner_id: owner, entries: [], favorites: [] } });
    }
    if (url.pathname === '/api/v1/library')
      return ok({ owner_id: account.owner_id, entries: [], favorites: [] });
    if (url.pathname === '/api/v1/account/state')
      return ok({ account, library: { owner_id: account.owner_id, entries: [], favorites: [] } });
    if (url.pathname === '/api/v1/follow')
      return ok({ owner_id: owner, owner_epoch: epoch, items: [] });
    if (url.pathname === '/api/v1/reservations') {
      if (request.method !== 'POST') {
        reads++;
        if (failRead)
          return {
            status: 503,
            body: {
              ok: false,
              code: 'ACCOUNT_RESERVATIONS_UNAVAILABLE',
              error: 'Synthetic reservation read unavailable',
            },
          };
        return ok(snapshot());
      }
      const input = JSON.parse(request.body || '{}') as ReservationMutationRequest;
      expect(input.owner_id).toBe(owner);
      expect(input.owner_epoch).toBe(epoch);
      writes.push(input);
      if (unknown) return { error: 'Synthetic lost reservation response' };
      if (!unconfirmed) {
        const matches = (item: ReservationItem) =>
          input.target.kind === 'item'
            ? item.reservation_id === input.target.id
            : item.series_id === input.target.id;
        items = items.filter((item) => !matches(item));
        if (input.enabled)
          items = [
            ...items,
            input.target.kind === 'item'
              ? upcoming(input.target.id)
              : { ...upcoming('991'), series_id: input.target.id },
          ];
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
    if (url.pathname === '/api/v1/lists/calendar')
      return ok({
        items: [
          {
            entry: {
              kind: 'upcoming',
              title: '日历预约预告',
              series_id: '888',
              cover: '',
              intro: '只有预告，没有可播选集',
            },
            reservation_id: '777',
            publish_text: '预计明日上线',
            tags: [],
          },
        ],
        has_more: false,
        next_offset: 0,
        session_id: '',
        calendar: {
          dates: ['20261116'],
          default_date: '20261116',
          current_date: '20261116',
        },
      });
    if (url.pathname === '/api/v1/series/seasons')
      return ok({
        items: [
          { drama: drama('123'), playable: true, upcoming: false, first_video_id: '1231' },
          {
            drama: { ...drama('124'), episode_count: 0 },
            playable: false,
            upcoming: true,
            reservation_id: '124',
            label: '第2季',
          },
          {
            drama: { ...drama('125'), episode_count: 0 },
            playable: false,
            upcoming: true,
            label: '第3季',
          },
        ],
      });
    if (url.pathname === '/api/v1/series/detail') {
      const id = url.searchParams.get('series_id') || '123';
      return ok({
        ...drama(id),
        episodes: [
          { index: 1, video_id: `${id}1`, locked: false },
          { index: 2, video_id: `${id}2`, locked: false },
        ],
      });
    }
    return { status: 404, body: { ok: false, error: 'Unexpected synthetic reservation request' } };
  };
  return {
    account,
    network,
    writes,
    reads: () => reads,
    acceptLogin: () => {
      acceptLogin = true;
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

export function registerReservationTests(target: 'desktop' | 'tv', entry: string) {
  const start = async (f: ReturnType<typeof fixture>, colorScheme: 'light' | 'dark' = 'light') => {
    const app = await open(entry, {
      width: target === 'tv' ? 1920 : 1440,
      height: 1080,
      platform: 'macos',
      clock: {},
      colorScheme,
      reducedMotion: true,
      network: { '*': f.network, 'POST *': f.network },
    });
    await app.press(
      target === 'tv'
        ? `role:button[${f.account.profile?.name || '登录'}]`
        : `label:账号与记录 >> role:button[${f.account.profile?.name || '登录'}]`,
    );
    await app.press('id:account-reservations');
    return app;
  };
  const goals = (f: ReturnType<typeof fixture>) =>
    f.writes.map(({ target: goal, enabled }) => [goal.kind, goal.id, enabled]);
  const viewingWrites = (app: Awaited<ReturnType<typeof start>>) =>
    app.requests().some(({ method, url }) => method === 'POST' && url.includes('/library'));

  test('reservation labels preserve real fields and distinguish item identity from a playable series', () => {
    expect(reservationItemId(online('777', '888'))).toBe('item-777');
    expect(reservationItemId({ ...online('777', '888'), reservation_id: undefined })).toBe(
      'series-888',
    );
    expect(reservationPublishLabel({ ...upcoming('777'), publish_text: undefined })).toBe('');
    expect(
      reservationPublishLabel({
        ...upcoming('777'),
        publish_text: '预计春节上线',
        publish_time: 1,
      }),
    ).toBe('预计春节上线');
  });
  test('guest reservation entrance uses account login without account reservation reads or writes', async () => {
    const f = fixture(false);
    const app = await start(f);
    await app.waitFor('id:reservations-login');
    expect(f.reads()).toBe(0);
    await app.press('id:reservations-login');
    await app.waitFor('id:account-login-open');
    expect(f.reads()).toBe(0);
    expect(f.writes).toEqual([]);
  });
  test('guest calendar reservation returns to the action and keyboard activation keeps its exact item', async () => {
    const f = fixture(false, []);
    const app = await start(f);
    if (target === 'tv') {
      await app.press('id:nav-discover');
      await app.press('id:discover-calendar');
    } else await app.press('id:nav-calendar');
    await app.waitFor('id:calendar-upcoming-777');
    await app.press('id:calendar-upcoming-777');
    await app.waitFor('id:calendar-reservation');
    await app.press('id:calendar-reservation');
    await app.waitFor('id:account-login-open');
    expect(f.reads()).toBe(0);
    f.acceptLogin();
    await app.press('id:account-login-open');
    await app.press('id:account-qr-start');
    await app.waitFor('id:account-logout');
    await app.back();
    await app.waitUntil(() => app.enabled('id:calendar-reservation'));
    await app.keyboard.press('enter');
    await app.waitFor('id:calendar-reservation >> text:已预约');
    expect(goals(f)).toEqual([['item', '777', true]]);
  });
  for (const theme of ['light', 'dark'] as const)
    test(`reservation ${theme} groups retain real metadata and only online summaries open details`, async () => {
      const f = fixture();
      const app = await start(f, theme);
      await app.waitFor('id:reservations-cancel-item-777');
      expect(app.shows('上线时间待定')).toBe(true);
      expect(app.shows('id:reservations-open-item-777')).toBe(false);
      expect(app.shows('id:reservations-open-item-400')).toBe(false);
      await app.press('id:reservations-mode-online');
      await app.waitFor('id:reservations-open-item-400');
      expect(app.shows('id:reservations-cancel-item-777')).toBe(false);
      await app.press('id:reservations-open-item-400');
      await app.waitFor('id:detail-start');
      expect(app.requests().some(({ url }) => url.includes('/series/detail?series_id=123'))).toBe(
        true,
      );
      expect(app.requests().some(({ url }) => url.includes('series_id=400'))).toBe(false);
      expect(f.writes).toEqual([]);
      expect(viewingWrites(app)).toBe(false);
    });
  test('missing metadata retains exact cancellation and absent item IDs never invent a cancellation target', async () => {
    const f = fixture(true, [
      { ...upcoming('777'), title: undefined },
      { ...upcoming('778'), reservation_id: undefined, series_id: '124' },
    ]);
    const app = await start(f);
    await app.waitFor('内容暂不可用');
    expect(app.shows('id:reservations-cancel-series-124')).toBe(false);
    expect(app.shows('暂时无法取消预约')).toBe(true);
    await app.press('id:reservations-cancel-item-777');
    await app.waitFor('id:reservations-row-item-777', { state: 'gone' });
    await app.wait(80);
    await app.keyboard.press('enter');
    expect(goals(f)).toEqual([['item', '777', false]]);
    expect(app.shows('id:reservations-row-series-124')).toBe(true);
    expect(app.requests().some(({ url }) => url.includes('/series/detail'))).toBe(false);
  });
  test('failed refresh preserves stale rows without claiming an empty list and recovery only reads', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:reservations-cancel-item-777');
    f.fail(true);
    await app.press('id:reservations-refresh');
    await app.waitFor('id:reservations-state');
    expect(app.shows('id:reservations-row-item-777')).toBe(true);
    expect(app.enabled('id:reservations-cancel-item-777')).toBe(false);
    expect(app.shows('暂无待上线的预约。')).toBe(false);
    f.fail(false);
    await app.press('id:reservations-state >> role:button[刷新状态]');
    await app.waitUntil(() => app.enabled('id:reservations-cancel-item-777'));
    expect(f.writes).toEqual([]);
  });
  test('initial failure stays distinct from a confirmed empty reservation group', async () => {
    const f = fixture();
    f.fail(true);
    const app = await start(f);
    await app.waitFor('id:reservations-state');
    expect(app.shows('暂无待上线的预约。')).toBe(false);
    expect(app.shows('id:reservations-list')).toBe(false);
    f.fail(false);
    await app.press('id:reservations-state >> role:button[刷新状态]');
    await app.waitFor('id:reservations-row-item-777');
    expect(f.writes).toEqual([]);
  });
  test('lost cancellation replies never automatically replay and explicit retry retains the exact item target', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:reservations-cancel-item-777');
    f.lose(true);
    await app.press('id:reservations-cancel-item-777');
    await app.waitFor('id:reservations-state-retry');
    await app.wait(1500);
    expect(f.writes.length).toBe(1);
    expect(app.shows('id:reservations-row-item-777')).toBe(true);
    f.lose(false);
    await app.press('id:reservations-state-retry');
    await app.waitFor('暂无待上线的预约。');
    expect(goals(f)).toEqual([
      ['item', '777', false],
      ['item', '777', false],
    ]);
  });
  test('an unconfirmed ACK keeps old membership and a refresh does not silently replay the write', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:reservations-cancel-item-777');
    f.unconfirmed(true);
    await app.press('id:reservations-cancel-item-777');
    await app.waitFor('请求已提交，预约结果待确认。');
    expect(app.shows('id:reservations-row-item-777')).toBe(true);
    await app.press('id:reservations-state >> role:button[刷新状态]');
    await app.wait(800);
    expect(f.writes.length).toBe(1);
    expect(app.shows('id:reservations-state-retry')).toBe(true);
  });
  test('calendar reserves the exact item without using its optional series as playable media', async () => {
    const f = fixture(true, []);
    const app = await start(f);
    if (target === 'tv') {
      await app.press('id:nav-discover');
      await app.press('id:discover-calendar');
    } else await app.press('id:nav-calendar');
    await app.waitFor('id:calendar-upcoming-777');
    await app.press('id:calendar-upcoming-777');
    await app.waitUntil(() => app.enabled('id:calendar-reservation'));
    await app.press('id:calendar-reservation');
    await app.waitFor('id:calendar-reservation >> text:已预约');
    expect(goals(f)).toEqual([['item', '777', true]]);
    expect(app.requests().some(({ url }) => url.includes('/series/detail'))).toBe(false);
    expect(app.requests().some(({ url }) => url.includes('/play/info'))).toBe(false);
    expect(viewingWrites(app)).toBe(false);
    await app.back();
    await app.waitFor('id:calendar-upcoming-777');
  });
  test('upcoming season reservation uses its explicit series identity while unopened seasons remain nonplayable', async () => {
    const f = fixture(true, [online('400', '123')]);
    const app = await start(f);
    await app.press('id:reservations-mode-online');
    await app.waitFor('id:reservations-open-item-400');
    await app.press('id:reservations-open-item-400');
    await app.waitFor('id:season-124');
    await app.press('id:season-124');
    await app.waitUntil(() => app.enabled('id:detail-reservation'));
    expect(app.enabled('id:detail-start')).toBe(false);
    await app.press('id:detail-reservation');
    await app.waitFor('id:detail-reservation >> text:已预约');
    expect(goals(f)).toEqual([['series', '124', true]]);
    await app.press('id:season-125');
    await app.waitFor('尚未开放预约');
    expect(app.enabled('id:detail-reservation')).toBe(false);
    expect(app.enabled('id:detail-start')).toBe(false);
    expect(app.requests().some(({ url }) => url.includes('/series/detail?series_id=124'))).toBe(
      false,
    );
    expect(app.requests().some(({ url }) => url.includes('/play/info'))).toBe(false);
    expect(viewingWrites(app)).toBe(false);
  });
  test('ambiguous membership permits only an explicit absolute add after a complete snapshot', async () => {
    const f = fixture(true, [{ ...upcoming('778'), reservation_id: undefined, series_id: '999' }]);
    const app = await start(f);
    if (target === 'tv') {
      await app.press('id:nav-discover');
      await app.press('id:discover-calendar');
    } else await app.press('id:nav-calendar');
    await app.waitFor('id:calendar-upcoming-777');
    await app.press('id:calendar-upcoming-777');
    await app.waitUntil(() => app.enabled('id:calendar-reservation'));
    expect(app.shows('id:calendar-reservation >> text:预约')).toBe(true);
    expect(f.writes).toEqual([]);
    await app.press('id:calendar-reservation');
    await app.waitFor('id:calendar-reservation >> text:已预约');
    expect(goals(f)).toEqual([['item', '777', true]]);
  });
  test('virtualized online detail returns preserve the exact source without writing viewing progress', async () => {
    const f = fixture(true, [
      ...Array.from({ length: 30 }, (_, index) =>
        online(String(8000 + index), String(9000 + index)),
      ),
      online('400', '123'),
    ]);
    const app = await start(f);
    await app.press('id:reservations-mode-online');
    await app.waitFor('id:reservations-list');
    await app.scroll('id:reservations-list', 16000);
    await app.waitFor('id:reservations-open-item-400');
    await app.scroll('id:reservations-list', 600);
    await app.press('id:reservations-open-item-400');
    await app.waitFor('id:detail-start');
    await app.back();
    await app.waitFor('id:reservations-open-item-400');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('id:detail-start');
    await app.waitFor('合成预约作品123');
    expect(f.writes).toEqual([]);
    expect(viewingWrites(app)).toBe(false);
  });
  test('a newer group and detail return prevent delayed cancellation from stealing focus', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('id:reservations-cancel-item-777');
    f.delayMutation(1000);
    await app.press('id:reservations-cancel-item-777');
    expect(f.writes.length).toBe(1);
    await app.press('id:reservations-mode-online');
    expect(app.enabled('id:reservations-cancel-item-400')).toBe(false);
    await app.press('id:reservations-open-item-400');
    await app.waitFor('id:detail-start');
    await app.back();
    await app.waitFor('id:reservations-open-item-400');
    await app.wait(1100);
    await app.keyboard.press('enter');
    await app.waitFor('id:detail-start');
    expect(goals(f)).toEqual([['item', '777', false]]);
    expect(viewingWrites(app)).toBe(false);
  });
}
