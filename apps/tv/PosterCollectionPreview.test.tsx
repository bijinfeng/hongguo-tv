import { platform } from 'nsh';
import { expect, open, test } from 'nsh/test';

const options = {
  width: 1100,
  height: 800,
  platform: 'macos' as const,
  reducedMotion: true,
  network: {},
};
const entry = './PosterCollectionPreview.tsx';
// NSH 0.7's Android test host does not complete horizontal List scroll gestures. The production
// collection is covered by the native browsing gates; keep these state tests on hosts that expose
// the gesture instead of turning a host limitation into a product failure.
const horizontalHostTest = platform.os === 'android' ? test.skip : test;

horizontalHostTest(
  'a new collection starts at its first item even when it reuses the previous item IDs',
  async () => {
    for (const grid of [false, true]) {
      const app = await open(entry, options);
      if (grid) await app.press('网格');
      await app.scroll('id:collection-list', 100000);
      await app.waitFor('id:drama-5047');
      await app.press('切换集合');
      await app.waitFor('id:drama-5000');
      expect(app.shows('id:drama-5047')).toBe(false);
      app.dispose();
    }
  },
);

horizontalHostTest(
  'shelf virtualizes later content and restores its exact identity after reorder',
  async () => {
    const app = await open(entry, options);
    await app.scroll('id:collection-list', 100000);
    await app.waitFor('id:drama-5047');
    await app.press('id:drama-5047');
    await app.waitFor('text:opened:5047 · primary:0');
    await app.press('重排');
    await app.press('返回集合');
    await app.wait(100);
    await app.keyboard.press('enter');
    await app.waitFor('text:opened:5047 · primary:0');
    app.dispose();
  },
);

test('grid reflow returns to identity and removed targets fall back to a survivor or entry', async () => {
  const app = await open(entry, options);
  await app.press('网格');
  await app.press('id:drama-5007');
  await app.press('缩窄区域');
  await app.press('返回集合');
  await app.wait(100);
  await app.keyboard.press('enter');
  await app.waitFor('text:opened:5007 · primary:0');
  await app.press('删除当前作品');
  await app.press('返回集合');
  await app.wait(100);
  await app.keyboard.press('enter');
  await app.waitFor('text:opened:5008 · primary:0');
  await app.press('清空作品');
  await app.press('返回集合');
  await app.wait(100);
  await app.keyboard.press('enter');
  await app.waitFor('text:opened:none · primary:1');
  app.dispose();
});

horizontalHostTest(
  'appended shelf pages stay reachable and newer intent cancels queued source recovery',
  async () => {
    const app = await open(entry, options);
    await app.press('追加一页');
    await app.scroll('id:collection-list', 100000);
    await app.waitFor('id:drama-6023');
    await app.press('id:drama-6023');
    await app.press('返回但选择入口');
    await app.wait(100);
    await app.keyboard.press('enter');
    await app.waitFor('text:opened:none · primary:1');
    expect(app.requests()).toEqual([]);
    app.dispose();
  },
);
