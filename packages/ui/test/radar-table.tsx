import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '../src/foundation';

/** Public actions, controlled values and return ownership; no business service fixtures. */
export function registerRadarTableTests(entry: string, target: ProductTarget = 'desktop') {
  const first = '9007199254740992';
  const second = '9007199254740993';
  const options = (colorScheme: 'light' | 'dark' = 'light'): OpenOptions => ({
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: 1080,
    colorScheme,
    reducedMotion: true,
    clock: {},
    network: {},
  });
  test('table actions preserve exact identities and wait for the external selection owner', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, options(theme));
      await app.press('id:radar-sample-reject');
      await app.press('id:radar-sample-second');
      await app.waitFor(
        `text:source:${second} · active:true · columns:wide · rows:32 · pending:none`,
      );
      await app.keyboard.press('enter');
      await app.waitFor(`text:selected:${first} · requested:${second} · presses:1`);
      expect(
        app.shows(`text:source:${second} · active:true · columns:wide · rows:32 · pending:none`),
      ).toBe(true);
      await app.press('id:radar-sample-external');
      await app.waitFor(`text:selected:${second} · requested:${second} · presses:1`);
      await app.press('id:radar-sample-accept');
      await app.press('id:radar-sample-first');
      await app.waitFor(
        `text:source:${first} · active:true · columns:wide · rows:32 · pending:none`,
      );
      await app.keyboard.press('enter');
      await app.waitFor(`text:selected:${first} · requested:${first} · presses:2`);
      await app.press('id:radar-sample-pending');
      await app.waitFor('text:正在读取详情…');
      expect(app.shows(`label:春日来信`)).toBe(true);
      expect(app.requests()).toEqual([]);
      app.dispose();
    }
  });
  test('column navigation, column replacement and an empty table never submit a row', async () => {
    const app = await open(entry, options());
    await app.press('id:radar-columns-next');
    await app.waitFor('id:radar-column-status');
    await app.press('id:radar-columns-prev');
    await app.waitFor('id:radar-column-rank');
    expect(app.shows('text:9223372036854775807')).toBe(true);
    expect(app.shows('text:-9223372036854775808')).toBe(true);
    expect(app.shows('text:—')).toBe(true);
    await app.press('id:radar-sample-columns');
    await app.waitFor('id:radar-column-title');
    expect(app.count('id:radar-column-rank')).toBe(0);
    await app.press('id:radar-sample-columns');
    await app.press('id:radar-columns-prev');
    await app.waitFor('id:radar-column-rank');
    await app.press('id:radar-sample-empty');
    await app.waitFor('text:暂无条目');
    expect(app.count(`id:radar-entry-${first}`)).toBe(0);
    expect(app.shows(`text:selected:${first} · requested:none · presses:0`)).toBe(true);
    await app.press('id:radar-sample-empty');
    await app.press('id:radar-sample-first');
    await app.waitFor(`id:radar-entry-${first}`);
    expect(app.shows(`text:selected:${first} · requested:none · presses:0`)).toBe(true);
    expect(app.requests()).toEqual([]);
    app.dispose();
  });
  test('later row restoration is repeatable and inactive or stale owners cannot steal focus', async () => {
    const app = await open(entry, options());
    for (let repeat = 0; repeat < 2; repeat++) {
      await app.press('id:radar-sample-later');
      await app.waitFor('text:source:129 · active:true · columns:wide · rows:32 · pending:none');
      await app.keyboard.press('enter');
      await app.waitFor(`text:selected:129 · requested:129 · presses:${repeat + 1}`);
      await app.press('id:radar-sample-first');
      await app.waitFor(
        `text:source:${first} · active:true · columns:wide · rows:32 · pending:none`,
      );
    }
    await app.press('id:radar-sample-stale');
    await app.wait(80);
    expect(
      app.shows(`text:source:${first} · active:true · columns:wide · rows:32 · pending:none`),
    ).toBe(true);
    await app.press('id:radar-sample-active');
    await app.press('id:radar-sample-later');
    await app.wait(80);
    expect(
      app.shows(`text:source:${first} · active:false · columns:wide · rows:32 · pending:none`),
    ).toBe(true);
    expect(app.shows('text:selected:129 · requested:129 · presses:2')).toBe(true);
    await app.press('id:radar-sample-active');
    await app.press('id:radar-sample-later');
    await app.waitFor('text:source:129 · active:true · columns:wide · rows:32 · pending:none');
    await app.waitFor('id:radar-entry-129');
    await app.press('id:radar-sample-pending');
    await app.waitFor('text:source:129 · active:true · columns:wide · rows:32 · pending:129');
    await app.waitFor('id:radar-entry-129');
    expect(app.shows('text:正在读取详情…')).toBe(true);
    expect(app.shows('text:selected:129 · requested:129 · presses:2')).toBe(true);
    await app.press('id:radar-sample-pending');
    await app.press('id:radar-sample-columns');
    await app.waitFor(`id:radar-entry-${first}`);
    expect(app.count('id:radar-column-rank')).toBe(0);
    expect(app.shows('text:selected:129 · requested:129 · presses:2')).toBe(true);
    expect(app.requests()).toEqual([]);
    app.dispose();
  });
}
