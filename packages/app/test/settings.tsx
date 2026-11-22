import { expect, open, test, type StubRequest, type StubResponse } from 'nsh/test';

const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });

/** Synthetic responses only exercise the production App/store; functional acceptance stays external. */
function fixture(request: StubRequest): StubResponse {
  const url = new URL(request.url);
  if (url.pathname === '/api/v1/search/history') return ok({ items: [] });
  if (url.pathname === '/api/v1/search/suggestions') return ok({ items: [] });
  if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
  if (url.pathname === '/api/v1/library') return ok({ favorites: [], entries: [], owner_id: '' });
  if (url.pathname === '/api/v1/account')
    return ok({
      logged_in: false,
      sync: { state: 'local', pending: 0 },
      owner_id: '',
      owner_epoch: 'c'.repeat(32),
      qr_login_available: true,
      phone_login_available: true,
    });
  if (url.pathname === '/api/v1/category') return ok({ items: [] });
  if (url.pathname === '/api/v1/search') return ok({ items: [], has_more: false });
  if (url.pathname === '/api/v1/notifications') return ok({ items: [], unread: 0 });
  return ok({ items: [] });
}
const network = { '*': fixture, 'POST *': fixture };

const stored = (app: { storage(): Record<string, string> }) => {
  const raw = app.storage()['settings.v1'];
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
};

export function registerSettingsTests(target: 'desktop' | 'tv' = 'desktop', entry = './App.tsx') {
  const dimensions = {
    width: target === 'tv' ? 1920 : 1440,
    height: target === 'tv' ? 1080 : 1000,
  };
  const openSettings = async (options: { storage?: Record<string, string> } = {}) => {
    const app = await open(entry, {
      ...dimensions,
      platform: target === 'tv' ? 'android' : 'macos',
      reducedMotion: true,
      network,
      ...options,
    });
    await app.waitFor('id:nav-settings');
    await app.press('id:nav-settings');
    await app.waitFor('id:settings-page');
    return app;
  };

  test('settings page lists only real preferences and persists a playback change', async () => {
    const app = await openSettings();
    for (const section of ['外观', '播放', '账号', '本机数据']) {
      expect(app.texts().some((text) => text.includes(section))).toBe(true);
    }
    // The headless entry has no update adapter, so the update section stays absent.
    expect(app.shows('id:settings-auto-updates-row')).toBe(false);
    await app.waitUntil(() => app.enabled('id:settings-autoplay'));
    expect(app.enabled('id:settings-reset')).toBe(false);
    await app.press('id:settings-autoplay');
    await app.waitUntil(() => stored(app)?.autoplayNext === false);
    expect(app.enabled('id:settings-reset')).toBe(true);
    await app.press('id:settings-reset');
    await app.waitUntil(() => stored(app)?.autoplayNext === true);
    expect(app.enabled('id:settings-reset')).toBe(false);
    expect(app.texts().some((text) => text.includes('设置未能保存'))).toBe(false);
  });

  test('settings: a stored theme and speed survive a new mount', async () => {
    const first = await openSettings();
    // TV lays both choices on the row itself as segments; desktops open the anchored select.
    const pick = async (id: string, option: string, value: string) => {
      const control = target === 'tv' ? `id:${id}-${value}` : `id:${id}-trigger`;
      await first.waitUntil(() => first.enabled(control));
      await first.press(control);
      if (target !== 'tv') await first.press(option);
    };
    await pick('settings-theme', '浅色', 'light');
    await first.waitUntil(() => stored(first)?.theme === 'light');
    await pick('settings-rate', '1.5×', '1.5');
    await first.waitUntil(() => stored(first)?.defaultRate === '1.5');
    const second = await openSettings({ storage: first.storage() });
    await second.waitUntil(() => second.texts().some((text) => text.includes('浅色')));
    expect(second.texts().some((text) => text.includes('1.5×'))).toBe(true);
  });

  test('settings: unreadable storage falls back to defaults and says so', async () => {
    const app = await openSettings({ storage: { 'settings.v1': '{not json' } });
    await app.waitUntil(() => app.texts().some((text) => text.includes('设置未能读取')));
    expect(app.texts().some((text) => text.includes('跟随系统'))).toBe(true);
  });

  test('settings: reachable from the target navigation and back leaves the page', async () => {
    const app = await openSettings();
    await app.waitUntil(() => app.enabled('id:settings-autoplay'));
    // The page's own crumb names the destination and returns through the same stack.
    expect(app.texts().some((text) => text.includes('返回发现'))).toBe(true);
    await app.press('id:settings-back');
    await app.waitFor('id:settings-page', { state: 'gone' });
    const reopened = await openSettings();
    await reopened.waitUntil(() => reopened.enabled('id:settings-autoplay'));
    await reopened.back();
    await reopened.waitFor('id:settings-page', { state: 'gone' });
  });
}
