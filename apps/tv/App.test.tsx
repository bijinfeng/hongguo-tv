import {
  registerApplicationTests,
  registerLibraryTests,
  registerPlaybackTests,
} from '@hongguo/app/testing';
import { T0Probe, T0Session } from 'hongguo-tv/native';
import { expect, open, test } from 'nsh/test';

test('TV T0 mixed bridge calls, cancels owner work and releases classes', async () => {
  await open('./App.tsx', { platform: 'android' });
  expect(T0Probe.ping()).toBe('tv-t0-rust');

  const session = new T0Session();
  expect(session.state()).toBe('alive');
  session.dispose();
  let disposed = false;
  try {
    session.state();
  } catch (error) {
    disposed = String(error).includes('disposed');
  }
  expect(disposed).toBe(true);

  const taskApp = await open('./T0Probe.tsx', { platform: 'android', clock: {} });
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

registerApplicationTests();
registerLibraryTests();
registerPlaybackTests();
