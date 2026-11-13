import {
  registerApplicationTests,
  registerBrowsingTests,
  registerLibraryTests,
  registerPlaybackTests,
  registerNativeStartupTests,
} from '@hongguo/app/testing';
import { expect, open, test } from 'nsh/test';

test('TV T0 mixed bridge calls, cancels owner work and releases classes', async () => {
  const taskApp = await open('./T0Probe.tsx', { platform: 'android', clock: {} });
  await taskApp.waitFor('tv-t0-rust');
  await taskApp.waitFor('session-released');
  await taskApp.waitFor('t0-running');
  await taskApp.press('取消任务');
  await taskApp.waitFor('t0-running', { state: 'gone' });
  // Advance beyond the Rust timer's deadline so a late callback cannot pass unnoticed.
  await taskApp.wait(1000);
  expect(taskApp.shows('completed')).toBe(false);

  const completedApp = await open('./T0Probe.tsx', { platform: 'android', clock: {} });
  await completedApp.wait(1000);
  expect(completedApp.shows('completed')).toBe(true);
});

registerApplicationTests('tv', './HttpFixture.tsx');
registerLibraryTests();
registerPlaybackTests();

registerBrowsingTests('tv', './HttpFixture.tsx');

registerNativeStartupTests();
