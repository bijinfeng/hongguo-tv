import { expect, open, test, type App } from 'nsh/test';
import { token } from 'nsh';
import { textLineHeight } from '@hongguo/ui';

/**
 * The shape contract of the TV shell, read from the app the user actually gets.
 *
 * This replaces what a separate HTML prototype used to claim: that a page's boxes are a certain
 * size, in a certain place, in both appearances. It is deliberately not a pixel diff — every
 * expectation below is derived from the token the app itself reads, so a token change moves the
 * expectation with the implementation instead of pinning yesterday's numbers.
 *
 * Only what a token owns is asserted. Composition (which column a poster lands in, how a page
 * divides its height) has no token and is left to the host observations in VALIDATION.
 */

/** Synthetic responses for the shell around the home page; no real account or catalog. */
const ok = (data: unknown) => ({ body: { ok: true, data } });
const poster = {
  series_id: '123',
  title: '合成剧名',
  cover: '',
  intro: '仅用于版式回归',
  episode_count: 1,
  episodes: [{ index: 1, video_id: '456', locked: false }],
};
const fixture = (request: { url: string }) => {
  const path = new URL(request.url).pathname;
  if (path === '/api/v1/library') return ok({ favorites: [], entries: [], owner_id: '' });
  if (path === '/api/v1/account')
    return ok({ logged_in: false, sync: { state: 'local', pending: 0 }, qr_login_available: true });
  if (path === '/api/v1/search/history' || path === '/api/v1/search/suggestions')
    return ok({ items: [] });
  if (path === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
  // The home catalog needs a real page shape, or it renders its failure state and the shelf
  // this contract measures never appears.
  if (path === '/api/v1/category')
    return ok({
      items: [poster],
      filters: [
        { type: 'category_dim_theme', options: [{ id: 'urban', label: '都市' }] },
        { type: 'sort', options: [{ id: 'online_time', label: '最新' }] },
      ],
      has_more: false,
      session_id: 'layout-contract',
      next_offset: 0,
    });
  return ok({ items: [], has_more: false });
};

/** The TV design surface, exactly as the product opens it. */
const screen = { width: 960, height: 540 } as const;

async function openShell(entry: string, colorScheme: 'light' | 'dark'): Promise<App> {
  const app = await open(entry, {
    ...screen,
    platform: 'macos',
    colorScheme,
    reducedMotion: true,
    clock: {},
    network: { '*': fixture, 'POST *': () => ok({}) },
  });
  await app.waitFor('id:home-scroll', { timeout: 20_000 });
  return app;
}

const boxOf = (app: App, selector: string) => {
  const layout = app.layout(selector);
  return layout && { x: layout.x, y: layout.y, w: layout.width, h: layout.height };
};

export function registerLayoutContractTests(entry: string) {
  const surfaces: Record<'light' | 'dark', { page?: string | null; control?: string | null }> = {
    light: {},
    dark: {},
  };

  for (const colorScheme of ['dark', 'light'] as const) {
    test(`TV shell keeps its token-owned geometry in ${colorScheme}`, async () => {
      const app = await openShell(entry, colorScheme);
      try {
        const inset = 36; // tvInsets(): the 5% safe frame plus focus clearance
        const clearance = 6;

        // The page column: the safe frame decides where content starts, not a page's own padding.
        const scroll = boxOf(app, 'id:home-scroll');
        expect(scroll).not.toBeNull();
        expect(scroll!.x).toBe(inset + clearance);
        expect(scroll!.w).toBe(screen.width - (inset + clearance) * 2);

        // A tool control takes its height from the control token the app reads for that size. The
        // shell's two tool buttons are plain controls (`md`); only a navigation bar uses `lg`. The
        // box is that height plus the border it draws, so the token is a floor, not an equality.
        const toolHeight = Number(token('control-md-height').toString().replace('px', ''));
        const navHeight = Number(token('control-lg-height').toString().replace('px', ''));
        const search = boxOf(app, 'id:nav-search');
        const settings = boxOf(app, 'id:nav-settings');
        expect(search).not.toBeNull();
        expect(settings).not.toBeNull();
        expect(search!.h).toBeGreaterThanOrEqual(toolHeight);
        expect(settings!.w).toBe(settings!.h); // an icon-only control is square

        // A destination in the bar is the large control, and its height is the large token or the
        // text it holds, whichever is taller: a navigation bar labels itself with the `section`
        // role (18px × 1.5 = 27) plus the large control's own vertical padding (8 × 2) = 43, above
        // the theme's 40. Either input moving changes this number, which is the point — a `>=`
        // here would pass for any growth, so this is an equality on both inputs.
        const padding = Number(token('control-lg-padding-y').toString().replace('px', ''));
        const labelHeight = Math.round(textLineHeight('section'));
        const destination = boxOf(app, 'id:nav-home');
        expect(destination!.h).toBe(Math.max(navHeight, labelHeight + padding * 2));
        expect(navHeight).toBeGreaterThan(toolHeight);

        // A painted surface proves the control pulled a colour from the theme. Which colour is
        // checked below, by requiring the two appearances to differ: `token()` in a test process
        // reports the runner's own appearance, not the one `open()` gives the app, so its value
        // cannot stand in for the app's here.
        surfaces[colorScheme].control = app.viewStyle('id:nav-search')?.backgroundColor;
        expect(surfaces[colorScheme].control).toBeTruthy();
        // The current destination inverts against the plain control, in either appearance.
        const currentBg = app.viewStyle('id:nav-home')?.backgroundColor;
        expect(currentBg).toBeTruthy();
        expect(currentBg).not.toBe(surfaces[colorScheme].control);
      } finally {
        app.dispose();
      }
    });
  }

  test('the two appearances paint the shell differently', () => {
    expect(surfaces.dark.control).toBeTruthy();
    expect(surfaces.light.control).toBeTruthy();
    expect(surfaces.dark.control).not.toBe(surfaces.light.control);
  });
}
