import {
  registerApplicationTests,
  registerAccountTests,
  registerSettingsTests,
  registerBrowsingTests,
  registerLibraryTests,
  registerPlaybackTests,
  registerWatchStatisticsTests,
  registerNativeStartupTests,
} from '@hongguo/app/testing';

registerApplicationTests('desktop', './HttpFixture.tsx');
registerLibraryTests();
registerPlaybackTests();
registerWatchStatisticsTests();

registerBrowsingTests('desktop', './HttpFixture.tsx');

registerNativeStartupTests();

import { registerUpdateTests } from '@hongguo/app/testing';
registerUpdateTests();

import { registerCalendarTests } from '@hongguo/app/testing';
registerCalendarTests();

import { registerCalendarBackTests } from '@hongguo/app/testing';
registerCalendarBackTests();

import { registerRankingsTests } from '@hongguo/app/testing';
registerRankingsTests();
import { registerRadarTests } from '@hongguo/app/testing/radar';
registerRadarTests();

import { registerLibraryLifecycleTests } from '@hongguo/app/testing';
registerLibraryLifecycleTests();

registerAccountTests('desktop', './HttpFixture.tsx');
registerSettingsTests('desktop', './HttpFixture.tsx');
