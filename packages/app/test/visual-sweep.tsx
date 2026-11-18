import { expect, open, test, type App } from 'nsh/test';

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
const screens: Screen[] = [
  {
    name: 'home',
    // A previous theme's pass can end on a stack page; back out until the shell shows again.
    open: async (app) => {
      for (let attempt = 0; attempt < 4 && !app.shows('id:home-scroll'); attempt++) {
        await app.back().catch(() => {});
        await app.wait(200);
      }
    },
    ready: 'id:home-scroll',
  },
  {
    name: 'discover',
    open: (app) => app.press('id:nav-discover'),
    ready: 'id:category-results',
  },
  {
    name: 'rankings',
    // The previous theme's pass ends on the radar tab, so the source tab is selected again.
    open: async (app) => {
      await app.press('id:nav-rank');
      await app.press('id:ranking-view-official');
    },
    ready: 'id:ranking-hero',
  },
  {
    name: 'radar',
    open: (app) => app.press('id:ranking-view-radar'),
    ready: 'id:radar-page',
  },
  {
    name: 'history',
    open: async (app) => {
      await app.press('id:nav-rank');
      await app.press('id:nav-history');
    },
    ready: 'id:history-page',
  },
  {
    name: 'calendar',
    open: async (app) => {
      await app.press('id:nav-home');
      await openFromHome(app, 'id:home-calendar', 'id:release-calendar');
    },
    ready: 'id:release-calendar',
  },
  {
    name: 'settings',
    open: (app) => app.press('id:nav-settings'),
    ready: 'id:settings-page',
  },
  {
    name: 'detail',
    open: async (app) => {
      await app.back();
      await app.press('id:nav-home');
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
export function registerVisualSweep(entry: string, artifacts: string | undefined) {
  test('visual sweep: every TV screen and the whole gallery in one app', async () => {
    // DESIGN.md: a TV surface is 960x540dp whether the panel is 1080p or 4K.
    const app = await open(entry, {
      width: 960,
      height: 540,
      colorScheme: 'light',
      reducedMotion: true,
      network: 'live',
    });
    try {
      await app.waitFor(screens[0].ready, { timeout: 20_000 });
      for (const scheme of ['light', 'dark'] as const) {
        await app.setColorScheme(scheme);
        for (const screen of screens) {
          await screen.open(app);
          await app.waitFor(screen.ready, { timeout: 20_000 });
          // Covers and transitions settle before the frame stands as evidence.
          await app.wait(400);
          if (artifacts) await app.screenshot(`${artifacts}/tv-${screen.name}-${scheme}.png`);
          expect(app.shows(screen.ready)).toBe(true);
        }
      }

      // The flat gallery needs one tall surface; the product shell keeps its own size after.
      await app.host.send('view', 'gallery');
      await app.setViewport(1920, 4400);
      await app.waitFor('id:gallery-scroll', { timeout: 20_000 });
      for (const scheme of ['light', 'dark'] as const) {
        await app.setColorScheme(scheme);
        await app.wait(600);
        // The last group's own content: if it is on screen, nothing below was cut off.
        expect(app.shows('text:更新下载进度')).toBe(true);
        if (artifacts) await app.screenshot(`${artifacts}/components-tv-all-${scheme}.png`);
      }
      await app.host.send('view', 'app');
      await app.setViewport(960, 540);
      await app.waitFor('id:home-scroll', { timeout: 20_000 });
    } finally {
      app.dispose();
    }
  }, 300_000);
}
