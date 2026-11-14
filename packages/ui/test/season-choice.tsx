import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '../src/foundation';

export function registerSeasonChoiceTests(entry: string, target: ProductTarget) {
  const options = (colorScheme: 'light' | 'dark' = 'light'): OpenOptions => ({
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: 1080,
    colorScheme,
    reducedMotion: true,
    network: {},
    clock: {},
  });
  test('season choice reports once and waits for the external owner to accept selection', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, options(theme));
      await app.press('id:choice-reject');
      await app.press('id:choice-two');
      await app.waitFor('text:choice:selected:one · requested:two · presses:1');
      await app.press('id:choice-external');
      await app.waitFor('text:choice:selected:two · requested:two · presses:1');
      await app.press('id:choice-accept');
      await app.press('id:choice-three');
      await app.waitFor('text:choice:selected:three · requested:three · presses:2');
      expect(app.requests()).toEqual([]);
      app.dispose();
    }
  });
  test('arrows move season focus without choosing; confirmation activates one target once', async () => {
    const app = await open(entry, options());
    await app.press('id:choice-reset');
    await app.waitFor('text:choice:focused:one');
    await app.keyboard.press('right');
    await app.waitFor('text:choice:focused:two');
    expect(app.shows('text:choice:selected:one · requested:none · presses:0')).toBe(true);
    await app.keyboard.press('enter');
    await app.waitFor('text:choice:selected:two · requested:two · presses:1');
    await app.keyboard.press('right');
    await app.keyboard.press('space');
    await app.waitFor('text:choice:selected:three · requested:three · presses:2');
    expect(app.count('role:button[春山不负第三季，待上线]')).toBe(1);
    expect(app.count('id:choice-three >> role:button')).toBe(0);
    app.dispose();
  });
  test('season status has a separate type role and multiline content grows instead of clipping', async () => {
    const app = await open(entry, options('dark'));
    const title = app.spanStyle('id:choice-three >> text:春山不负第三季');
    const status = app.spanStyle('id:choice-three >> text:待上线');
    expect(title.fontSize > status.fontSize).toBe(true);
    await app.press('id:choice-multiline');
    await app.press('id:choice-measure');
    await app.waitFor('text:choice:geometry:grows');
    expect(app.shows('text:待上线\n此为合成长状态\n用于验证自然高度')).toBe(true);
    await app.setViewport(target === 'tv' ? 1280 : 800, 1000);
    await app.press('id:choice-measure');
    await app.waitFor('text:choice:geometry:grows');
    app.dispose();
  });
}
