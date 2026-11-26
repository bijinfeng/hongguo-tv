import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '../src/foundation';

/** Public date choice contract; the fixture owns selected values and selection acceptance. */
export function registerDateChoiceTests(entry: string, target: ProductTarget = 'desktop') {
  const settings = (colorScheme: 'light' | 'dark' = 'light'): OpenOptions => ({
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: target === 'tv' ? 1080 : 1000,
    colorScheme,
    reducedMotion: true,
    clock: {},
    network: {},
  });
  const dayColor = (app: Awaited<ReturnType<typeof open>>, value: string, day: string) =>
    app.spanStyle(`id:date-choice-${value} >> text:${day}`).color;

  test('inline date preserves the full date name and controlled selection', async () => {
    const app = await open(entry, settings());
    expect(app.shows('id:date-choice-inline >> text:3月1日 周五')).toBe(true);
    await app.press('id:date-choice-hold');
    await app.press('id:date-choice-inline');
    await app.waitFor('text:requested:20240301 · presses:1');
    expect(app.shows('text:selected:20240228')).toBe(true);
    app.dispose();
  });

  test('date choice keeps external ownership and updates selected presentation in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, settings(theme));
      const selectedColor = dayColor(app, '20240228', '28');
      const normalColor = dayColor(app, '20240229', '29');
      expect(selectedColor === normalColor).toBe(false);
      await app.press('id:date-choice-hold');
      await app.press('id:date-choice-20240229');
      await app.waitFor('text:requested:20240229 · presses:1');
      expect(app.shows('text:selected:20240228')).toBe(true);
      expect(dayColor(app, '20240228', '28')).toBe(selectedColor);
      expect(dayColor(app, '20240229', '29')).toBe(normalColor);
      await app.press('id:date-choice-external');
      await app.waitFor('text:selected:20240229');
      expect(dayColor(app, '20240229', '29')).toBe(selectedColor);
      expect(dayColor(app, '20240228', '28')).toBe(normalColor);
      expect(app.shows('text:requested:20240229 · presses:1')).toBe(true);
      expect(app.requests().length).toBe(0);
      app.dispose();
    }
  });
  test('date choice renders Gregorian leap days and omits impossible or malformed dates', async () => {
    const app = await open(entry, settings());
    expect(app.shows('label:2024年2月29日 周四')).toBe(true);
    expect(app.shows('label:2000年2月29日 周二')).toBe(true);
    for (const value of [
      '19000229',
      '20230229',
      '20240431',
      '00000101',
      '20241301',
      '20240001',
      '20240100',
      '2024-02-29',
    ])
      expect(app.shows(`id:date-choice-invalid-${value}`)).toBe(false);
    await app.press('id:date-choice-century-leap');
    await app.waitFor('text:selected:20000229');
    await app.waitFor('text:requested:20000229 · presses:1');
    app.dispose();
  });
  test('date choice arrows move focus without selecting and confirmation selects exactly once', async () => {
    const app = await open(entry, settings());
    await app.press('id:date-choice-reset');
    await app.waitFor('text:focused:20240228');
    await app.keyboard.press('right');
    await app.waitFor('text:focused:20240229');
    expect(app.shows('text:selected:20240228')).toBe(true);
    expect(app.shows('text:requested:none · presses:0')).toBe(true);
    await app.keyboard.press('enter');
    await app.waitFor('text:selected:20240229');
    await app.waitFor('text:requested:20240229 · presses:1');
    await app.keyboard.press('right');
    await app.waitFor('text:focused:20240301');
    await app.keyboard.press('space');
    await app.waitFor('text:selected:20240301');
    await app.waitFor('text:requested:20240301 · presses:2');
    await app.keyboard.press('home');
    await app.waitFor('text:focused:20240228');
    expect(app.shows('text:selected:20240301')).toBe(true);
    app.dispose();
  });
}
