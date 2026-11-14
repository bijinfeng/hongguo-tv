import { expect, open, test } from 'nsh/test';
import type { ProductTarget } from '@hongguo/ui';

export function registerSeasonPickerTests(entry: string, target: ProductTarget) {
  const settings = {
    platform: 'macos' as const,
    width: target === 'tv' ? 1920 : 1440,
    height: 1080,
    reducedMotion: true,
    network: {},
    clock: {},
  };
  test('season browsing keeps complete server order and the missing original source without guessing season numbers', async () => {
    const app = await open(entry, settings);
    await app.waitFor('text:picker:order:200,300,400');
    expect(app.count('id:season-source')).toBe(1);
    expect(app.shows('label:官方第二季，可观看')).toBe(true);
    expect(app.shows('label:未编号的新故事，待上线')).toBe(true);
    expect(app.shows('label:作品400，暂不可观看')).toBe(true);
    await app.press('id:season-300');
    await app.waitFor('text:picker:selected:300 · availability:upcoming');
    await app.waitFor('text:picker:changes:300 · reads:1');
    await app.press('id:season-300');
    expect(app.shows('text:picker:changes:300 · reads:1')).toBe(true);
    await app.press('id:season-source');
    await app.waitFor('text:picker:selected:100 · availability:unknown');
    expect(app.shows('text:picker:changes:300,100 · reads:1')).toBe(true);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
    app.dispose();
  });
  test('inactive controller rejects a choice; reactivation accepts unavailable browsing without a media read', async () => {
    const app = await open(entry, settings);
    await app.waitFor('text:picker:order:200,300,400');
    await app.press('id:picker-inactive');
    await app.press('id:season-400');
    expect(app.shows('text:picker:selected:100 · availability:unknown')).toBe(true);
    expect(app.shows('text:picker:changes:none · reads:1')).toBe(true);
    await app.press('id:picker-active');
    await app.press('id:season-400');
    await app.waitFor('text:picker:selected:400 · availability:unavailable');
    await app.waitFor('text:picker:changes:400 · reads:1');
    app.dispose();
  });
  test('catalog error keeps the explicit safe retry action and recovers the new source', async () => {
    const app = await open(entry, settings);
    await app.waitFor('text:picker:order:200,300,400');
    await app.press('id:picker-fail');
    await app.waitFor('text:系列加载失败，请重试');
    expect(app.shows('id:season-200')).toBe(false);
    await app.press('id:picker-recover');
    await app.press('重试');
    await app.waitFor('text:picker:order:200,300,400');
    expect(app.shows('text:picker:selected:900 · availability:unknown')).toBe(true);
    expect(app.shows('text:picker:changes:none · reads:3')).toBe(true);
    app.dispose();
  });
  test('browsing selection never changes the real playing season, including a source missing from the service list', async () => {
    const app = await open(entry, settings);
    await app.waitFor('text:picker:order:200,300,400');
    await app.press('id:picker-playing-source');
    await app.waitFor('label:原始作品，播放中');
    await app.press('id:season-200');
    await app.waitFor('text:picker:selected:200 · availability:playable');
    expect(app.shows('label:原始作品，播放中')).toBe(true);
    expect(app.shows('label:官方第二季，可观看')).toBe(true);
    expect(app.shows('text:picker:playing:100')).toBe(true);
    await app.press('id:season-300');
    await app.waitFor('text:picker:selected:300 · availability:upcoming');
    expect(app.shows('label:原始作品，播放中')).toBe(true);
    await app.press('id:picker-playing-second');
    await app.waitFor('label:官方第二季，播放中');
    expect(app.shows('text:picker:selected:300 · availability:upcoming')).toBe(true);
    expect(app.shows('label:原始作品，播放中')).toBe(false);
    expect(app.shows('text:picker:playing:200')).toBe(true);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
    app.dispose();
  });
  test('only unfinished history with a saved video is resumable, while real playback takes precedence', async () => {
    const app = await open(entry, settings);
    await app.waitFor('text:picker:order:200,300,400');
    await app.press('id:picker-resumable');
    await app.waitFor('label:官方第二季，可续播');
    await app.press('id:season-200');
    await app.waitFor('text:picker:selected:200 · availability:playable');
    expect(app.shows('label:官方第二季，可续播')).toBe(true);
    await app.press('id:picker-completed');
    await app.waitFor('label:官方第二季，可观看');
    expect(app.shows('label:官方第二季，可续播')).toBe(false);
    expect(app.shows('text:picker:selected:200 · availability:playable')).toBe(true);
    await app.press('id:picker-no-video');
    expect(app.shows('label:官方第二季，可观看')).toBe(true);
    await app.press('id:picker-resumable');
    await app.waitFor('label:官方第二季，可续播');
    await app.press('id:picker-playing-second');
    await app.waitFor('label:官方第二季，播放中');
    await app.press('id:picker-playing-none');
    await app.waitFor('label:官方第二季，可续播');
    expect(app.shows('text:picker:changes:200 · reads:1')).toBe(true);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
    app.dispose();
  });
}
