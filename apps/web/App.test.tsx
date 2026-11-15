import {
  registerApplicationTests,
  registerAccountTests,
  registerBrowsingTests,
  registerLibraryTests,
  registerPlaybackTests,
  registerWatchStatisticsTests,
  registerNativeStartupTests,
} from '@hongguo/app/testing';

registerApplicationTests();
registerLibraryTests();
registerPlaybackTests();
registerWatchStatisticsTests();

registerBrowsingTests();

registerNativeStartupTests();

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

registerAccountTests('desktop', './App.tsx');
