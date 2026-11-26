import { expect, open, test, type App } from 'nsh/test';
import { calendarFixture } from './calendar-fixture';

export type CalendarHostTarget = 'headless' | 'web' | 'macos' | 'android';

/** Shared production calendar acceptance, with strictly read-only synthetic responses. */
export function registerCalendarHostTests(
  entry: string,
  artifacts: string,
  host: CalendarHostTarget,
  product: 'desktop' | 'tv' = host === 'android' ? 'tv' : 'desktop',
) {
  const sizes =
    host === 'android'
      ? [undefined]
      : host === 'headless'
        ? [{ width: product === 'tv' ? 1920 : 1440, height: product === 'tv' ? 1080 : 1000 }]
        : product === 'tv'
          ? [
              { width: 1280, height: 720 },
              { width: 1920, height: 1080 },
            ]
          : [
              { width: 1180, height: 780 },
              { width: 1440, height: 1000 },
            ];
  const readCount = (source: ReturnType<typeof calendarFixture>, prefix: string) =>
    source.reads.filter((path) => path.startsWith(prefix)).length;
  const enterCalendar = async (app: App) => {
    if (product === 'tv') await app.press('id:nav-discover');
    await app.press(product === 'tv' ? 'id:discover-calendar' : 'id:nav-calendar');
    await app.waitFor('id:calendar-upcoming-301');
  };
  const readonly = (source: ReturnType<typeof calendarFixture>) => {
    expect(source.writes.length).toBe(0);
    expect(source.unknown).toEqual([]);
    expect(source.reads.some((path) => /\/play\/|\/lists\/rank/.test(path))).toBe(false);
    expect(source.reads.some((path) => /series_id=30[12]|series_id=311/.test(path))).toBe(false);
  };
  for (const size of sizes)
    for (const colorScheme of ['light', 'dark'] as const) {
      const suffix = `${product}-${size?.width ?? 'device'}-${colorScheme}`;
      const settings = (source: ReturnType<typeof calendarFixture>) => ({
        ...size,
        ...(host === 'headless' ? { platform: 'macos' as const, clock: {} } : {}),
        colorScheme,
        reducedMotion: size?.width === 1180 || host === 'headless',
        network: {
          '*': source.handle,
          'POST *': source.handle,
          'PUT *': source.handle,
          'DELETE *': source.handle,
        },
      });
      const capture = async (app: App, name: string) => {
        if (host === 'headless') return;
        await app.wait(250);
        await app.screenshot(`${artifacts}/${name}-${suffix}.png`);
      };
      test(`calendar ${host} ${suffix}: announcements, cached dates, independent modes and exact source return`, async () => {
        const source = calendarFixture();
        const app = await open(entry, settings(source));
        await enterCalendar(app);
        expect(source.reads.includes('/api/v1/lists/calendar')).toBe(true);
        expect(
          source.reads.some(
            (path) => path.includes('/lists/calendar?') && path.includes('subscribe_offset='),
          ),
        ).toBe(false);
        await capture(app, 'calendar');
        await app.press('id:calendar-upcoming-301');
        // The announcement now carries the real reservation action above its prose.
        await app.waitFor('id:calendar-reservation');
        expect(readCount(source, '/api/v1/series/detail')).toBe(0);
        await capture(app, 'announcement');
        await app.press('id:calendar-announcement-close');
        await app.wait(250);
        await app.keyboard.press('enter');
        await app.waitFor('id:calendar-reservation');
        await app.press('id:calendar-announcement-close');
        await app.press('id:calendar-released-101');
        await app.waitFor('id:episode-1011');
        await capture(app, 'released-detail');
        await app.back();
        await app.waitFor('id:calendar-released-101');
        await app.wait(250);
        await app.keyboard.press('enter');
        await app.waitFor('id:episode-1011');
        await app.back();
        await app.waitFor('id:calendar-date-20261115');
        await app.press('id:calendar-date-20261115');
        await app.waitFor('id:calendar-upcoming-311');
        await app.keyboard.press('left');
        await app.keyboard.press('enter');
        await app.waitFor('id:calendar-upcoming-301');
        await app.keyboard.press('right');
        await app.keyboard.press('enter');
        await app.waitFor('id:calendar-upcoming-311');
        expect(readCount(source, '/api/v1/lists/calendar?date=20261115')).toBe(1);
        await capture(app, 'date-cached');
        await app.press('id:calendar-mode-new');
        await app.waitFor('id:calendar-released-201');
        await capture(app, 'new-series');
        await app.press('id:calendar-mode-calendar');
        await app.waitFor('id:calendar-upcoming-311');
        await app.press('id:calendar-mode-new');
        await app.waitFor('id:calendar-released-201');
        expect(readCount(source, '/api/v1/lists/new?gender=2')).toBe(1);
        await app.press('id:calendar-more');
        await app.waitFor('id:calendar-released-202');
        expect(app.shows('id:calendar-more')).toBe(false);
        await app.press('id:calendar-mode-calendar');
        await app.waitFor('id:calendar-upcoming-311');
        expect(app.shows('id:calendar-released-202')).toBe(false);
        readonly(source);
        app.dispose();
      });
      if (host === 'headless' || size?.width === 1180 || size?.width === 1280) {
        test(`calendar ${host} ${suffix}: long missing-cover announcement and empty date keep recovery reachable`, async () => {
          const source = calendarFixture({ longAnnouncement: true, emptyTomorrow: true });
          const app = await open(entry, settings(source));
          await enterCalendar(app);
          await app.press('id:calendar-upcoming-301');
          await app.waitFor('id:calendar-announcement-close');
          expect(app.shows('id:calendar-results')).toBe(false);
          expect(app.shows('id:calendar-more')).toBe(false);
          await capture(app, 'announcement-long-missing-cover');
          await app.keyboard.press('pagedown');
          await app.wait(100);
          await capture(app, 'announcement-keyboard-scrolled');
          await app.keyboard.press('enter');
          await app.waitFor('id:calendar-upcoming-301');
          await app.keyboard.press('enter');
          await app.waitFor('id:calendar-announcement-close');
          await app.keyboard.press('escape');
          await app.waitFor('id:calendar-upcoming-301');
          await app.keyboard.press('enter');
          await app.waitFor('id:calendar-announcement-close');
          await app.press('id:calendar-date-20261115');
          await app.waitFor('这天暂未安排上新');
          expect(app.shows('id:calendar-announcement-close')).toBe(false);
          await capture(app, 'empty-date');
          readonly(source);
          app.dispose();
        });
      }
      test(`calendar ${host} ${suffix}: virtualized offscreen detail and cached date/mode scroll anchors`, async () => {
        const source = calendarFixture({ longLists: true });
        const app = await open(entry, settings(source));
        await enterCalendar(app);
        expect(app.shows(`id:calendar-released-${product === 'tv' ? '520' : '540'}`)).toBe(false);
        await app.scroll('id:calendar-results', product === 'tv' ? 5200 : 6000);
        await app.wait(200);
        const later = Array.from({ length: product === 'tv' ? 32 : 12 }, (_, i) =>
          String((product === 'tv' ? 520 : 540) + i),
        ).find((id) => app.shows(`id:calendar-released-${id}`));
        expect(later !== undefined).toBe(true);
        await capture(app, 'calendar-offscreen');
        await app.press(`id:calendar-released-${later}`);
        await app.waitFor(`id:episode-${later}1`);
        await app.back();
        await app.waitFor(`id:calendar-released-${later}`);
        await app.wait(200);
        await capture(app, 'calendar-offscreen-return');
        await app.keyboard.press('enter');
        await app.waitFor(`id:episode-${later}1`);
        await app.back();
        await app.waitFor(`id:calendar-released-${later}`);
        await app.press('id:calendar-date-20261115');
        await app.waitFor('id:calendar-upcoming-311');
        await app.press('id:calendar-date-20261114');
        await app.waitFor(`id:calendar-released-${later}`);
        expect(readCount(source, '/api/v1/lists/calendar?date=20261115')).toBe(1);
        expect(readCount(source, '/api/v1/lists/calendar')).toBe(2);
        await app.press('id:calendar-mode-new');
        await app.waitFor('id:calendar-released-700');
        expect(app.shows(`id:calendar-released-${product === 'tv' ? '720' : '740'}`)).toBe(false);
        await app.scroll('id:calendar-results', product === 'tv' ? 5200 : 6000);
        await app.wait(200);
        const newLater = Array.from({ length: product === 'tv' ? 32 : 12 }, (_, i) =>
          String((product === 'tv' ? 720 : 740) + i),
        ).find((id) => app.shows(`id:calendar-released-${id}`));
        expect(newLater !== undefined).toBe(true);
        await app.press('id:calendar-mode-calendar');
        await app.waitFor(`id:calendar-released-${later}`);
        await app.press('id:calendar-mode-new');
        await app.waitFor(`id:calendar-released-${newLater}`);
        expect(readCount(source, '/api/v1/lists/new?gender=2')).toBe(1);
        await capture(app, 'mode-scroll-cached');
        readonly(source);
        app.dispose();
      }, 60000);
      for (const newerIntent of [false, true])
        test(`calendar ${host} ${suffix}: exact retry, empty advancement and ${host === 'web' ? 'immediate' : 'delayed'} terminal ${newerIntent ? 'newer date intent' : 'owned focus handoff'}`, async () => {
          // NSH 0.5.0 Web delayed stubs do not wake an idle engine; the HTTP suite covers that race.
          const source = calendarFixture({ terminalDelayMs: host === 'web' ? 0 : 1200 });
          const app = await open(entry, settings(source));
          await enterCalendar(app);
          await app.press('id:calendar-more');
          await app.waitFor('重试加载更多');
          await capture(app, 'continuation-error');
          await app.keyboard.press('enter');
          await app.waitFor('id:calendar-upcoming-302');
          const retried = source.reads.filter(
            (path) => path.includes('/lists/calendar?') && path.includes('offset=45'),
          );
          expect(retried.length).toBe(2);
          expect(retried[0]).toBe(retried[1]);
          await app.press('id:calendar-more');
          await app.waitUntil(() =>
            source.reads.some((path) => path.includes('subscribe_offset=23&offset=24')),
          );
          await app.waitFor('加载更多');
          expect(app.shows('id:calendar-upcoming-302')).toBe(true);
          await app.press('id:calendar-more');
          expect(source.terminalReads()).toBe(1);
          if (host !== 'web') {
            expect(app.enabled('id:calendar-more')).toBe(false);
            if (!newerIntent) await capture(app, 'continuation-pending');
          }
          if (newerIntent) await app.press('id:calendar-date-20261114');
          await app.waitFor('id:calendar-released-102');
          await app.waitFor('id:calendar-more', { state: 'gone' });
          await app.wait(250);
          await capture(app, newerIntent ? 'terminal-newer-focus' : 'terminal');
          const requestsAtEnd = source.reads.length;
          await app.wait(100);
          expect(source.reads.length).toBe(requestsAtEnd);
          await app.keyboard.press('right');
          await app.keyboard.press('enter');
          await app.waitFor(newerIntent ? 'id:calendar-upcoming-311' : 'id:calendar-released-201');
          readonly(source);
          app.dispose();
        });
    }
}

/** Real image decoding complements the deterministic read/ownership tests above. */
export function registerCalendarVisualTests(
  entry: string,
  artifacts: string,
  product: 'desktop' | 'tv',
) {
  for (const size of product === 'tv'
    ? [
        { width: 1280, height: 720 },
        { width: 1920, height: 1080 },
      ]
    : [
        { width: 1180, height: 780 },
        { width: 1440, height: 1000 },
      ]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`calendar images ${product} ${size.width} ${colorScheme}`, async () => {
        const app = await open(entry, {
          ...size,
          network: 'live',
          colorScheme,
          reducedMotion: size.width === 1180 || size.width === 1280,
        });
        const capture = async (name: string) => {
          await app.wait(400);
          await app.screenshot(
            `${artifacts}/images-${name}-${product}-${size.width}-${colorScheme}.png`,
          );
        };
        if (product === 'tv') await app.press('id:nav-discover');
        await app.press(product === 'tv' ? 'id:discover-calendar' : 'id:nav-calendar');
        await app.waitFor('id:calendar-upcoming-301');
        await capture('calendar');
        await app.scroll('id:calendar-results', 240);
        await capture('calendar-scrolled');
        await app.press('id:calendar-date-20261114');
        await app.keyboard.press('right');
        await capture('date-focus');
        await app.press('id:calendar-upcoming-301');
        await app.waitFor('id:calendar-reservation');
        await capture('announcement');
        await app.press('id:calendar-announcement-close');
        await app.press('id:calendar-mode-new');
        await app.waitFor('id:calendar-released-201');
        await capture('new-series');
        app.dispose();
      });
    }
  }
}
