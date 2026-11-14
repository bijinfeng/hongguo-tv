import {
  registerApplicationTests,
  registerBrowsingTests,
  registerLibraryTests,
  registerPlaybackTests,
  registerNativeStartupTests,
} from '@hongguo/app/testing';

registerApplicationTests('desktop', './HttpFixture.tsx');
registerLibraryTests();
registerPlaybackTests();

registerBrowsingTests('desktop', './HttpFixture.tsx');

registerNativeStartupTests();

import { registerUpdateTests } from '@hongguo/app/testing';
registerUpdateTests();

import { registerCalendarTests } from '@hongguo/app/testing';
registerCalendarTests();

import { registerCalendarBackTests } from '@hongguo/app/testing';
registerCalendarBackTests();
