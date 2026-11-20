// The shared suite runs once, on desktop: these groups take no target and contain no
// platform branch, so running them in all three entries executed the same 52 tests three
// times. Desktop keeps them; web and TV keep only what their own entry adds.
import {
  registerApplicationTests,
  registerAccountTests,
  registerSettingsTests,
  registerBrowsingTests,
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

registerBrowsingTests('tv', './HttpFixture.tsx');

import { registerUpdateTests } from '@hongguo/app/testing';
registerUpdateTests();

import { registerCalendarTests } from '@hongguo/app/testing';
registerCalendarTests();

import { registerCalendarBackTests } from '@hongguo/app/testing';
registerCalendarBackTests();

registerAccountTests('tv', './HttpFixture.tsx');
registerSettingsTests('tv', './HttpFixture.tsx');
