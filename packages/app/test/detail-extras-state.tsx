import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '@hongguo/ui';

/** Real DetailExtras source callbacks; no copied component or business adapters. */
export function registerDetailExtrasStateTests(entry: string, target: ProductTarget) {
  const options: OpenOptions = {
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: 1080,
    reducedMotion: true,
    clock: {},
    network: {},
  };
  const actor = '7007199254740993';
  const related = '9007199254740993';
  const later = '5011';
  test('actor and offscreen related returns retain exact identities and Enter activates the same source', async () => {
    const app = await open(entry, options);
    await app.press(`id:detail-actor-${actor}`);
    await app.waitFor(`text:opened:actor:${actor} · opens:1 · alternate:0`);
    await app.press('id:extras-state-restore');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:actor:${actor} · opens:2 · alternate:0`);
    for (let step = 0; step < 8 && !app.shows(`id:drama-${later}`); step++) {
      await app.scroll('id:extras-state-scroll', 600);
      await app.wait(80);
    }
    await app.waitFor(`id:drama-${later}`);
    // Parent-viewport Lists include overscan; finish moving the last fixture row into view.
    await app.scroll('id:extras-state-scroll', 600);
    await app.press(`id:drama-${later}`);
    await app.waitFor(`text:opened:related:${later} · opens:3 · alternate:0`);
    await app.press('id:extras-state-top');
    await app.press('id:extras-state-restore');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:related:${later} · opens:4 · alternate:0`);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });
  test('a new input in the same turn wins over queued actor and related focus restoration', async () => {
    for (const [kind, selector, id] of [
      ['actor', `id:detail-actor-${actor}`, actor],
      ['related', `id:drama-${related}`, related],
    ]) {
      const app = await open(entry, options);
      await app.press(selector);
      await app.waitFor(`text:opened:${kind}:${id} · opens:1 · alternate:0`);
      await app.press('id:extras-state-interrupt');
      await app.wait(80);
      await app.keyboard.press('enter');
      await app.waitFor(`text:opened:${kind}:${id} · opens:1 · alternate:1`);
      expect(app.requests()).toEqual([]);
      expect(app.audio()).toEqual([]);
      app.dispose();
    }
  });
  test('old actor and related callbacks cannot restore or navigate after collection replacement or disposal', async () => {
    for (const selector of [`id:detail-actor-${actor}`, `id:drama-${related}`]) {
      const app = await open(entry, options);
      await app.press(selector);
      await app.press('id:extras-state-switch');
      await app.waitFor('text:active:true · collection:two · mounted:true');
      await app.press('id:extras-state-restore');
      await app.wait(80);
      await app.keyboard.press('enter');
      expect(app.texts().some((text) => text.endsWith(' · opens:1 · alternate:1'))).toBe(true);
      await app.press(selector);
      await app.press('id:extras-state-unmount');
      await app.waitFor('text:active:true · collection:two · mounted:false');
      await app.press('id:extras-state-restore');
      await app.wait(80);
      await app.keyboard.press('enter');
      expect(app.texts().some((text) => text.endsWith(' · opens:2 · alternate:2'))).toBe(true);
      expect(app.shows('id:detail-extras')).toBe(false);
      expect(app.requests()).toEqual([]);
      expect(app.audio()).toEqual([]);
      app.dispose();
    }
  });
  test('inactive and background owners cannot open actor or related destinations or apply old returns', async () => {
    const app = await open(entry, options);
    await app.press(`id:detail-actor-${actor}`);
    await app.press('id:extras-state-active');
    await app.press(`id:detail-actor-${actor}`);
    await app.press(`id:drama-${related}`);
    await app.press('id:extras-state-restore');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:actor:${actor} · opens:1 · alternate:1`);
    await app.press('id:extras-state-active');
    await app.setLifecycle('background');
    await app.press(`id:detail-actor-${actor}`);
    await app.press(`id:drama-${related}`);
    await app.press('id:extras-state-restore');
    await app.wait(80);
    await app.setLifecycle('active');
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:actor:${actor} · opens:1 · alternate:2`);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });
  test('related identity survives viewport changes and repeated source restoration', async () => {
    const app = await open(entry, options);
    await app.press(`id:drama-${later}`);
    // Headless press dispatches activation without focusing; establish real focus before resizing.
    await app.press('id:extras-state-restore');
    await app.wait(80);
    await app.setViewport(target === 'desktop' ? 780 : 1280, 1080);
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:related:${later} · opens:2 · alternate:0`);
    await app.press('id:extras-state-restore');
    await app.setViewport(target === 'desktop' ? 1440 : 1920, 1080);
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:related:${later} · opens:3 · alternate:0`);
    await app.press('id:extras-state-interrupt');
    await app.setViewport(target === 'desktop' ? 780 : 1280, 1080);
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:opened:related:${later} · opens:3 · alternate:1`);
    expect(app.requests()).toEqual([]);
  });
  test('incomplete final rows expose each valid work without retaining removed slots', async () => {
    const app = await open(entry, options);
    let opens = 0;
    for (const size of [9, 10, 11]) {
      await app.press(`id:extras-state-count-${size}`);
      const id = String(5000 + size - 1);
      await app.press(`id:drama-${id}`);
      await app.waitFor(`text:opened:related:${id} · opens:${++opens} · alternate:0`);
      expect(app.count('id:drama-5011')).toBe(0);
      await app.press('id:extras-state-restore');
      await app.wait(80);
      await app.keyboard.press('enter');
      await app.waitFor(`text:opened:related:${id} · opens:${++opens} · alternate:0`);
    }
    expect(app.requests()).toEqual([]);
  });
}
