import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '../src/foundation';

/** Public row semantics; fixture state accepts or rejects the component's requests. */
export function registerRankingCardTests(entry: string, target: ProductTarget = 'desktop') {
  const settings = (colorScheme: 'light' | 'dark' = 'light'): OpenOptions => ({
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: target === 'tv' ? 1080 : 1000,
    colorScheme,
    reducedMotion: true,
    clock: {},
    network: {},
  });

  test('ranking row selection is caller owned and drama and actor identities stay independent', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, settings(theme));
      await app.press('id:ranking-hold');
      await app.press('id:ranking-row-actor:42');
      await app.waitFor('text:requested:actor:42 · presses:1');
      expect(app.shows(`text:target:${target} · selected:drama:42`)).toBe(true);
      await app.press('id:ranking-external');
      await app.waitFor(`text:target:${target} · selected:actor:42`);
      expect(app.shows('text:requested:actor:42 · presses:1')).toBe(true);
      await app.press('id:ranking-reset');
      await app.press('id:ranking-row-actor:42');
      await app.waitFor(`text:target:${target} · selected:actor:42`);
      await app.waitFor('text:requested:actor:42 · presses:1');
      await app.press('id:ranking-row-drama:42');
      await app.waitFor('text:requested:drama:42 · presses:2');
      expect(app.shows(`text:target:${target} · selected:drama:42`)).toBe(true);
      expect(app.requests().length).toBe(0);
      app.dispose();
    }
  });

  test('ranking row arrows only move focus and confirmation activates one whole row once', async () => {
    const app = await open(entry, settings());
    await app.press('id:ranking-reset');
    await app.waitFor('text:focused:drama:42');
    await app.keyboard.press('down');
    await app.waitFor('text:focused:actor:42');
    expect(app.shows('text:requested:none · presses:0')).toBe(true);
    expect(app.shows(`text:target:${target} · selected:drama:42`)).toBe(true);
    await app.keyboard.press('enter');
    await app.waitFor('text:requested:actor:42 · presses:1');
    await app.keyboard.press('up');
    await app.waitFor('text:focused:drama:42');
    expect(app.shows('text:requested:actor:42 · presses:1')).toBe(true);
    await app.keyboard.press('space');
    await app.waitFor('text:requested:drama:42 · presses:2');
    expect(app.count('role:button[第1名，春日来信，查看短剧]')).toBe(1);
    expect(app.count('role:button[第17名，林悦，查看演员]')).toBe(1);
    expect(app.count('id:ranking-row-drama:42 >> role:button[查看短剧]')).toBe(0);
    expect(app.count('id:ranking-row-actor:42 >> role:button[查看演员]')).toBe(0);
    app.dispose();
  });

  test('ranking row keeps real ranks and never fabricates missing or invalid positions', async () => {
    const app = await open(entry, settings());
    expect(app.shows('label:第1名，春日来信，查看短剧')).toBe(true);
    expect(app.shows('label:第17名，林悦，查看演员')).toBe(true);
    const unranked = [
      ['drama:missing', '重逢以后，那封跨越漫长岁月的来信终于送到了你的手中', '查看短剧'],
      ['actor:zero', '零名次示例', '查看演员'],
      ['drama:negative', '负数名次示例', '查看短剧'],
      ['actor:fraction', '小数名次示例', '查看演员'],
      ['drama:nan', '非数名次示例', '查看短剧'],
      ['actor:infinity', '无限名次示例', '查看演员'],
    ];
    for (const [key, title, action] of unranked) {
      // Keep the contract reachable when the host only reports visible scroll contents.
      for (let attempt = 0; !app.shows(`label:${title}，${action}`) && attempt < 8; attempt++)
        await app.scroll('id:ranking-scroll', 200);
      expect(app.count(`id:ranking-row-${key}`)).toBe(1);
      expect(app.count(`role:button[${title}，${action}]`)).toBe(1);
      expect(app.shows(`label:${title}，${action}`)).toBe(true);
      expect(app.count(`id:ranking-row-${key} >> role:button[${action}]`)).toBe(0);
    }
    app.dispose();
  });

  test('ranking preview switches product density without replacing caller owned selection', async () => {
    const app = await open(entry, settings());
    for (const next of ['tv', 'desktop'] as const) {
      await app.press(`id:ranking-${next}`);
      await app.waitFor(`text:target:${next} · selected:drama:42`);
      expect(app.shows('text:requested:none · presses:0')).toBe(true);
    }
    await app.press('id:ranking-row-actor:42');
    await app.waitFor('text:target:desktop · selected:actor:42');
    await app.waitFor('text:requested:actor:42 · presses:1');
    app.dispose();
  });
}
