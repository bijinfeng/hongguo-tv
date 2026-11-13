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
