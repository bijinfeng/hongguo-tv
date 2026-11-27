import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';

/**
 * Facts the service left unknown must not be invented downstream.
 *
 * Three regressions live here, all on the returning viewer's first frame: a resume record without
 * an episode number must not become "第 1 集", a record without a duration must not animate a bar
 * forever, and a player without a known total must not claim "共 0 集".
 */
const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });

const drama = {
  series_id: '123',
  title: '作物',
  cover: '',
  intro: '仅用于未知字段回归',
  // No episode_count: the service did not supply a total. The episode list is what makes the detail
  // page playable, so the player itself can be reached with the total still unknown.
  episodes: [{ index: 1, video_id: '456', locked: false }],
};

/** One resume entry with every optional fact missing; only the sort key is supplied. */
const entry = {
  drama: { series_id: '123', title: '作物', cover: '', intro: '' },
  last_played_at: 1,
};

function networkFor(value: unknown) {
  return (request: StubRequest): StubResponse => {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/v1/library') return ok({ owner_id: '', entries: value, favorites: [] });
    if (path === '/api/v1/account')
      return ok({
        logged_in: false,
        sync: { state: 'local', pending: 0 },
        qr_login_available: true,
      });
    if (path === '/api/v1/search/history' || path === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (path === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (path === '/api/v1/category')
      return ok({
        items: [drama],
        filters: [
          { type: 'category_dim_theme', options: [{ id: 'urban', label: '都市' }] },
          { type: 'sort', options: [{ id: 'online_time', label: '最新' }] },
        ],
        has_more: false,
        session_id: 'unknown-fields',
        next_offset: 0,
      });
    if (path === '/api/v1/series/detail') return ok(drama);
    if (path === '/api/v1/series/seasons') return ok({ items: [] });
    // The player only mounts once a playable source is resolved; the media itself is never read.
    if (path === '/api/v1/play/info')
      return ok({
        path: '/minireel-proxy/media/' + 'a'.repeat(64),
        vid: url.searchParams.get('vid'),
        video_codec: 'h264',
        quality: '720P',
        qualities: ['720P'],
      });
    if (path === '/api/v1/play/release') return ok({ released: true });
    return ok({ items: [], has_more: false });
  };
}

const routes = (value: unknown) => ({ '*': networkFor(value), 'POST *': networkFor(value) });

for (const target of ['desktop', 'tv'] as const) {
  test(`${target}: an unknown episode and duration are not invented on the resume rail`, async () => {
    const app = await open(target === 'tv' ? './TvApp.tsx' : './App.tsx', {
      width: target === 'tv' ? 960 : 1440,
      height: target === 'tv' ? 540 : 1000,
      platform: 'macos',
      reducedMotion: true,
      network: routes([entry]),
    });
    await app.waitFor('id:home-continue-123');
    expect(app.shows('作物')).toBe(true);
    // The record has no episode: the rail must not claim episode 1.
    expect(app.shows('第 1 集')).toBe(false);
    // No duration means no bar; an indeterminate bar animates forever.
    expect(app.shows('已看进度')).toBe(false);
  });
}

test('tv player omits the total instead of printing a zero count', async () => {
  // The TV title line is the one that printed `共 0 集` when no total was known. The desktop player
  // prints `playbackMeta()`, which already omits an unknown total, so this covers the TV branch.
  //
  // Reaching the player requires an episode, so the reachable "unknown total" shape is a detail
  // response that carries episodes but no `episode_count`. This test pins that the total is then
  // computed from the supplied episode list and never falls back to a literal 0.
  const app = await open('./TvApp.tsx', {
    width: 960,
    height: 540,
    platform: 'macos',
    reducedMotion: true,
    network: routes([entry]),
  });
  await app.waitFor('id:home-continue-123');
  // Resuming from the rail autoplays through the detail route into the player.
  await app.press('id:home-continue-123');
  await app.waitFor('id:player-controls-back');
  expect(app.shows('id:player-controls-back')).toBe(true);
  // The episode list is the supplied fact: one episode means one episode, not zero.
  expect(app.shows('共 1 集')).toBe(true);
  expect(app.shows('共 0 集')).toBe(false);
});
