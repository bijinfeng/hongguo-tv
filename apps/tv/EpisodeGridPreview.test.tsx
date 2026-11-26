import { expect, open, test } from 'nsh/test';

test('thousand-episode browsing retains playing identity and cannot activate the locked final item', async () => {
  const app = await open('./EpisodeGridPreview.tsx', {
    width: 960,
    height: 540,
    reducedMotion: true,
    network: {},
  });
  await app.press('id:episode-range-trigger');
  await app.keyboard.press('end');
  await app.keyboard.press('enter');
  await app.waitFor('id:player-episode-999');
  expect(app.shows('text:playing:1 · selected:0')).toBe(true);
  expect(app.enabled('id:player-episode-1000')).toBe(false);
  await app.press('id:player-episode-999');
  await app.waitFor('text:playing:1 · selected:999');
  await app.press('外部切至第500集');
  await app.waitFor('id:player-episode-500');
  expect(app.shows('text:playing:500 · selected:999')).toBe(true);
  app.dispose();
});
