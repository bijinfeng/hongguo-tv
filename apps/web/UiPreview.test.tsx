import { expect, open, test } from 'nsh/test';

test('controls keep disabled actions inert, readable covers and keyboard input', async () => {
  const app = await open('./UiPreview.tsx', {
    width: 1180,
    height: 780,
    platform: 'macos',
    reducedMotion: true,
    network: {},
  });
  expect(app.enabled('搜索')).toBe(false);
  expect(app.enabled('未开放')).toBe(false);
  await app.type('id:search-input', '重生');
  expect(app.enabled('搜索')).toBe(true);
  await app.press('搜索');
  await app.waitFor('封面加载失败仍可阅读长标题');
});
