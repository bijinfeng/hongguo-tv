import { expect, open, test } from 'nsh/test';

/** One production Web case against an isolated HTTP fixture, without NSH network stubs. */
export function registerCalendarWebTerminalTest(
  entry: string,
  artifacts: string,
  options: {
    name: string;
    width: number;
    height: number;
    colorScheme: 'light' | 'dark';
    newerIntent: boolean;
  },
) {
  test(options.name, async () => {
    const app = await open(entry, {
      width: options.width,
      height: options.height,
      colorScheme: options.colorScheme,
      reducedMotion: options.width === 1180,
      network: 'live',
    });
    try {
      await app.press('id:nav-calendar');
      await app.waitFor('id:calendar-upcoming-301');
      await app.press('id:calendar-more');
      await app.waitFor('重试加载更多');
      await app.keyboard.press('enter');
      await app.waitFor('id:calendar-upcoming-302');
      await app.press('id:calendar-more');
      await app.waitFor('加载更多');
      expect(app.shows('id:calendar-upcoming-302')).toBe(true);
      await app.press('id:calendar-more');
      expect(app.enabled('id:calendar-more')).toBe(false);
      if (options.newerIntent) await app.press('id:calendar-date-20261114');
      else await app.screenshot(`${artifacts}/pending.png`);

      await app.waitFor('id:calendar-released-102');
      await app.waitFor('id:calendar-more', { state: 'gone' });
      // The page restores focus in a frame after terminal content commits.
      await app.wait(250);
      await app.screenshot(`${artifacts}/terminal.png`);
      await app.keyboard.press('right');
      await app.keyboard.press('enter');
      await app.waitFor(
        options.newerIntent ? 'id:calendar-upcoming-311' : 'id:calendar-released-201',
      );
      await app.screenshot(`${artifacts}/keyboard-destination.png`);
    } finally {
      app.dispose();
    }
  });
}
