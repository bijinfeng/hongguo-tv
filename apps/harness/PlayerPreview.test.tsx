import { expect, open, test } from 'nsh/test';

test('cinema controls keep values, disabled actions and semantic overlays operable', async () => {
  const app = await open('./PlayerPreview.tsx', {
    width: 1180,
    height: 780,
    reducedMotion: true,
    network: {},
  });
  expect(app.enabled('下一集')).toBe(false);
  await app.press('播放');
  await app.waitFor('25 / 102');
  await app.press('选集');
  await app.waitFor('第 1 集');
  expect(app.enabled('第 2 集 · 未开放')).toBe(false);
  await app.keyboard.press('escape');
  await app.waitFor('播放器控件预览');
  await app.press('控件预览');
  expect(app.shows('播放')).toBe(false);
});
