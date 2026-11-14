import {
  registerApplicationTests,
  registerBrowsingTests,
  registerLibraryTests,
  registerPlaybackTests,
  registerNativeStartupTests,
} from '@hongguo/app/testing';

registerApplicationTests();
registerLibraryTests();
registerPlaybackTests();

registerBrowsingTests();

registerNativeStartupTests();

import { registerCalendarTests } from '@hongguo/app/testing';
registerCalendarTests();

import { registerCalendarBackTests } from '@hongguo/app/testing';
registerCalendarBackTests();

import { registerRankingsTests } from '@hongguo/app/testing';
registerRankingsTests();
