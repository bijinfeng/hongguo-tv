import { expect, open, test, type App, type SafeArea } from 'nsh/test';

/**
 * One app instance renders the TV product and the flat component gallery behind a switch, so the
 * whole visual pass costs one window. `app.host.send('view', …)` flips it; `setViewport` gives the
 * gallery the tall surface it needs. A single-window run also proves the two never fight over
 * theme, viewport or focus.
 */
type Screen = {
  name: string;
  /** Moves from whatever the previous step left on screen to this one. */
  open: (app: App) => Promise<void>;
  /** A stable element proving the screen finished loading. */
  ready: string;
};

/** Screens the remote reaches from the TV shell, in the order this sweep walks them. */
async function browse(app: App) {
  for (let depth = 0; depth < 5 && !app.shows('id:nav-home'); depth++) await app.back();
  await app.waitFor('id:nav-home');
}
async function section(app: App, id: string) {
  await browse(app);
  await app.press(`id:${id}`);
}
async function mine(app: App, id?: string) {
  await section(app, 'nav-mine');
  if (id) await app.press(`id:mine-${id}`);
}
async function settings(app: App, panel: string) {
  await section(app, 'nav-settings');
  await app.press(`id:settings-panel-${panel}`);
}
const screens: Screen[] = [
  {
    name: 'home',
    open: async (app) => {
      await section(app, 'nav-home');
    },
    ready: 'id:home-scroll',
  },
  { name: 'discover', open: (app) => section(app, 'nav-discover'), ready: 'id:category-results' },
  {
    name: 'rankings',
    open: async (app) => {
      await section(app, 'nav-rank');
      await app.press('id:ranking-view-official');
    },
    ready: 'id:ranking-results',
  },
  { name: 'radar', open: (app) => app.press('id:ranking-view-radar'), ready: 'id:radar-page' },
  { name: 'mine', open: (app) => mine(app), ready: 'id:mine-scroll' },
  { name: 'history', open: (app) => mine(app, 'history'), ready: 'id:history-page' },
  { name: 'favorites', open: (app) => mine(app, 'favorites'), ready: 'id:history-page' },
  { name: 'following', open: (app) => mine(app, 'following'), ready: 'id:following-page' },
  { name: 'reservations', open: (app) => mine(app, 'reservations'), ready: 'id:reservations-page' },
  {
    name: 'notifications',
    open: (app) => mine(app, 'notifications'),
    ready: 'id:notifications-page',
  },
  {
    name: 'calendar',
    open: async (app) => {
      await section(app, 'nav-discover');
      await app.press('id:discover-calendar');
    },
    ready: 'id:release-calendar',
  },
  { name: 'search', open: (app) => section(app, 'nav-search'), ready: 'id:results' },
  { name: 'account', open: (app) => mine(app, 'account'), ready: 'id:account-scroll' },
  { name: 'settings', open: (app) => settings(app, 'appearance'), ready: 'id:settings-theme-row' },
  {
    name: 'settings-playback',
    open: (app) => settings(app, 'playback'),
    ready: 'id:settings-autoplay-row',
  },
  {
    name: 'settings-local-data',
    open: (app) => settings(app, 'local-data'),
    ready: 'id:settings-local-data-row',
  },
  { name: 'about', open: (app) => settings(app, 'about'), ready: 'id:settings-about' },
  { name: 'support', open: (app) => settings(app, 'support'), ready: 'id:settings-support' },
  {
    name: 'recommendations',
    open: (app) => settings(app, 'recommendations'),
    ready: 'id:settings-recommendations',
  },
  {
    name: 'detail',
    open: async (app) => {
      await section(app, 'nav-home');
      await openFromHome(app, 'id:home-poster-123', 'id:detail-scroll');
    },
    ready: 'id:detail-scroll',
  },
];

/**
 * Scrolls the home rail until `selector` opens `ready`; at 960x540dp the rail starts below the
 * fold. A press can navigate and still reject because the pressed view disappears, so the
 * destination decides, not the press.
 */
async function openFromHome(app: App, selector: string, ready: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (app.shows(ready)) return;
    await app.press(selector).catch(() => {});
    await app.waitFor(ready, { timeout: 2000 }).catch(() => {});
    if (app.shows(ready)) return;
    await app.scroll('id:home-scroll', 600);
    await app.wait(200);
  }
  throw new Error(`${selector} never opened ${ready} from the TV home rail`);
}

/**
 * Walks the TV shell and the component gallery in one app. `artifacts` names the directory the
 * screenshots go to; without it the run only asserts every screen loads.
 */
export function registerVisualSweep(
  entry: string,
  artifacts: string | undefined,
  options: {
    host?: 'web' | 'android';
    scheme?: 'light' | 'dark';
    textScale?: number;
    safeArea?: SafeArea;
  } = {},
) {
  const android = options.host === 'android';
  const schemes = android ? ([options.scheme ?? 'light'] as const) : (['light', 'dark'] as const);
  test('visual sweep: every TV screen and the whole gallery in one app', async () => {
    // DESIGN.md: a TV surface is 960x540dp whether the panel is 1080p or 4K.
    const app = await open(entry, {
      ...(android
        ? {}
        : { width: 960, height: 540, colorScheme: 'light' as const, reducedMotion: true }),
      network: 'live',
      safeArea: options.safeArea,
    });
    try {
      await app.waitFor(screens[0].ready, { timeout: 20_000 });
      for (const scheme of schemes) {
        if (!android) await app.setColorScheme(scheme);
        for (const screen of screens) {
          console.log('TV_VISUAL_SCREEN', scheme, screen.name);
          await screen.open(app);
          await app.waitFor(screen.ready, { timeout: 20_000 });
          // Covers and transitions settle before the frame stands as evidence.
          await app.wait(400);
          if (artifacts) await app.screenshot(`${artifacts}/tv-${screen.name}-${scheme}.png`);
          expect(app.shows(screen.ready)).toBe(true);
        }
      }

      await section(app, 'nav-home');
      // The flat gallery needs one tall surface; the product shell keeps its own size after.
      await app.host.send('view', 'gallery');
      if (!android) await app.setViewport(1920, 4400);
      await app.waitFor('id:gallery-host-metrics');
      if (options.safeArea) {
        const area = options.safeArea;
        expect(
          app
            .texts()
            .some((text) =>
              text.includes(
                `insets ${area.top ?? 0}/${area.right ?? 0}/${area.bottom ?? 0}/${area.left ?? 0}`,
              ),
            ),
        ).toBe(true);
      }
      if (options.textScale !== undefined)
        await app.waitUntil(() =>
          app.texts().some((text) => text.includes(`· text ${options.textScale} ·`)),
        );
      console.log(
        'TV_HOST_METRICS',
        app.texts().filter((text) => text.startsWith('window ')),
      );
      await app.waitFor('id:gallery-scroll', { timeout: 20_000 });
      for (const scheme of schemes) {
        if (!android) await app.setColorScheme(scheme);
        await app.wait(600);
        if (android) {
          for (const group of [
            'foundation',
            'controls',
            'forms',
            'navigation',
            'layers',
            'content',
            'cinema',
            'feedback',
          ]) {
            await app.press(`id:gallery-sheet-${group}`);
            await app.wait(200);
            if (artifacts)
              await app.screenshot(`${artifacts}/components-tv-${group}-${scheme}.png`);
          }
        } else {
          expect(app.shows('text:更新下载进度')).toBe(true);
          if (artifacts) await app.screenshot(`${artifacts}/components-tv-all-${scheme}.png`);
        }
      }
      await app.host.send('view', 'app');
      if (!android) await app.setViewport(960, 540);
      await app.waitFor('id:home-scroll', { timeout: 20_000 });
    } finally {
      app.dispose();
    }
  }, 300_000);
}
