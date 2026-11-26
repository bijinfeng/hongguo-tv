import { openHistory } from './navigation';
import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';
import type { Account, Drama, Library, LibraryChange } from '@hongguo/core-client';

// Production App/store with explicit synthetic receipts; not real account or cloud acceptance.
const card = (series_id: string): Drama => ({
  series_id,
  title: `合成收藏作品${series_id}`,
  cover: '',
  intro: '仅用于收藏与切季边界回归',
  content_type: '1',
  episode_count: 1,
});
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
function fixture(lost = false) {
  let library: Library = { owner_id: '123', entries: [], favorites: [] };
  const writes: { path: string; change: LibraryChange }[] = [];
  const receipts = new Map<string, unknown>();
  const account: Account = {
    logged_in: true,
    phone_login_available: true,
    qr_login_available: true,
    owner_id: '123',
    owner_epoch: 'a'.repeat(32),
    profile: { uid: '123', name: '合成账号' },
    sync: { state: 'pending', pending: 1 },
  };
  let observations = 0;
  const network = (request: StubRequest): StubResponse => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/v1/account') return ok(account);
    if (path === '/api/v1/account/state') {
      observations++;
      return ok({ account, library });
    }
    if (path === '/api/v1/library') return ok(library);
    if (path === '/api/v1/search/history' || path === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (path === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (path === '/api/v1/search') return ok({ items: [card('123')], has_more: false });
    if (path === '/api/v1/series/seasons')
      return ok({
        items: ['123', '124'].map((id) => ({
          drama: card(id),
          playable: true,
          upcoming: false,
          first_video_id: `${id}1`,
        })),
      });
    if (path === '/api/v1/series/detail') {
      const id = url.searchParams.get('series_id') ?? '';
      return ok({
        ...card(id),
        episodes: [{ index: 1, video_id: `${id}1`, locked: false }],
        actors: [],
        related: [],
      });
    }
    if (path === '/api/v1/library/session') return ok({ session_id: 'b'.repeat(32) });
    if (path === '/api/v1/library/operation') {
      const change = JSON.parse(request.body ?? '{}') as LibraryChange;
      writes.push({ path: request.url, change });
      const previous = receipts.get(request.url);
      if (previous) return ok(previous);
      if (change.action === 'favorite') {
        const favorites = library.favorites.filter(
          (entry) => entry.drama.series_id !== change.drama.series_id,
        );
        if (change.value) favorites.push({ drama: change.drama, favorite_at: writes.length });
        library = { ...library, favorites };
      } else if (change.action === 'clear' && change.kind === 'favorites') {
        library = { ...library, favorites: [] };
      } else if (change.action === 'remove' && change.kind === 'favorites') {
        library = {
          ...library,
          favorites: library.favorites.filter(
            (entry) => entry.drama.series_id !== change.series_id,
          ),
        };
      } else throw new Error('Unexpected synthetic favorite mutation');
      const receipt = {
        session_id: url.searchParams.get('session_id'),
        operation_id: url.searchParams.get('operation_id'),
        outcome: { status: 'committed', library },
      };
      receipts.set(request.url, receipt);
      if (lost && writes.length === 1) return { error: 'Synthetic favorite receipt lost' };
      return ok(receipt);
    }
    return { status: 404, body: { ok: false, error: 'Unexpected synthetic favorite request' } };
  };
  return { network, writes, account, observations: () => observations, library: () => library };
}

export function registerLibraryFavoritesTests(target: 'desktop' | 'tv', entry: string) {
  const start = async (f: ReturnType<typeof fixture>) => {
    const app = await open(entry, {
      width: target === 'tv' ? 1920 : 1440,
      height: 1080,
      platform: 'macos',
      clock: {},
      reducedMotion: true,
      network: { '*': f.network, 'POST *': f.network },
    });
    if (target === 'tv') await app.press('id:nav-search');
    await app.type('id:search-input', '合成收藏');
    await app.press('搜索');
    await app.waitFor('合成收藏作品123');
    await app.press('id:drama-123');
    await app.waitFor('id:detail-favorite');
    return app;
  };
  test('detail favorites use the exact browsed season and never create a viewing history entry', async () => {
    const f = fixture();
    const app = await start(f);
    await app.press('id:detail-favorite');
    await app.waitFor('已收藏');
    await app.press('id:season-124');
    await app.waitFor('收藏');
    await app.press('id:detail-favorite');
    await app.waitFor('已收藏');
    expect(f.writes.map(({ change }) => change.action)).toEqual(['favorite', 'favorite']);
    expect(
      f.writes.map(({ change }) => change.action === 'favorite' && change.drama.series_id),
    ).toEqual(['123', '124']);
    expect(
      f.writes.every(({ change }) => change.action !== 'favorite' || !change.drama.episodes),
    ).toBe(true);
    expect(f.library().entries).toEqual([]);
    await app.back();
    await openHistory(app, target);
    await app.press('id:library-tabs-favorites');
    await app.waitFor('id:history-124');
    expect(app.texts().some((text) => text.includes('看到 '))).toBe(false);
    await app.press('id:history-124');
    await app.waitFor('返回收藏');
    await app.back();
    await app.waitFor('id:history-124');
    await app.press('id:history-manage');
    await app.press('id:history-remove-124');
    await app.waitFor('取消收藏会同步到当前账号；观看记录保留。');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('id:history-124', { state: 'gone' });
    expect(f.writes.at(-1)?.change).toEqual({
      action: 'remove',
      kind: 'favorites',
      owner_id: '123',
      series_id: '124',
    });
    await app.press('id:history-clear');
    await app.waitFor('仅清空本机收藏，不取消账号云端收藏；观看记录保留。');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('收藏的短剧会保存在这里。');
    expect(f.writes.at(-1)?.change).toEqual({
      action: 'clear',
      kind: 'favorites',
      owner_id: '123',
    });
    expect(f.library().entries).toEqual([]);
  });
  test('a lost favorite receipt remains unselected and explicit recovery reuses its original identity', async () => {
    const f = fixture(true);
    const app = await start(f);
    await app.press('id:detail-favorite');
    await app.waitFor('id:detail-favorite-retry');
    expect(app.enabled('id:detail-favorite')).toBe(false);
    expect(app.texts()).toContain('收藏');
    await app.press('id:season-124');
    expect(app.enabled('id:detail-favorite')).toBe(false);
    await app.waitFor('确认上一条收藏结果');
    expect(f.writes.length).toBe(1);
    await app.press('id:detail-favorite-retry');
    await app.waitFor('id:detail-favorite-retry', { state: 'gone' });
    expect(f.library().favorites.map((entry) => entry.drama.series_id)).toEqual(['123']);
    expect(app.texts()).toContain('收藏');
    await app.press('id:season-123');
    await app.waitFor('已收藏');
    expect(f.writes.length).toBe(2);
    expect(f.writes[0]).toEqual(f.writes[1]);
    expect(f.library().entries).toEqual([]);
  });
  test('detail observes account sync failures without cloud writes and pauses observation in background', async () => {
    const f = fixture();
    const app = await start(f);
    await app.waitFor('账号有 1 项待同步。');
    f.account.sync = { state: 'error', pending: 1, error: '合成云端同步失败' };
    await app.waitFor('合成云端同步失败');
    expect(f.writes).toEqual([]);
    await app.setLifecycle('background');
    const before = f.observations();
    await app.wait(20000);
    expect(f.observations()).toBe(before);
    await app.setLifecycle('active');
    await app.press('id:detail-library-sync >> role:button');
    await app.waitFor('id:account-sync');
    expect(f.writes).toEqual([]);
  });
}
