// The shared suite runs once, on desktop: these groups take no target and contain no
// platform branch, so running them in all three entries executed the same 52 tests three
// times. Desktop keeps them; web and TV keep only what their own entry adds.
import {
  registerApplicationTests,
  registerAccountTests,
  registerSettingsTests,
  registerBrowsingTests,
} from '@hongguo/app/testing';

registerApplicationTests();

registerBrowsingTests();

import { registerCalendarTests } from '@hongguo/app/testing';
registerCalendarTests();

import { registerCalendarBackTests } from '@hongguo/app/testing';
registerCalendarBackTests();

registerAccountTests('desktop', './App.tsx');
registerSettingsTests('desktop', './App.tsx');
