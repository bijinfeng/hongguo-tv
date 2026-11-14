import { mount } from 'nsh';
import { NativeApp } from '@hongguo/app';
import { NativeCore } from 'hongguo-desktop/native';
import { desktopUpdates } from './updates';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';

mount(() => (
  <NativeApp
    target="desktop"
    logoMark={logoMark}
    runtime={runtime}
    updates={desktopUpdates()}
    openCore={() => NativeCore.open()}
  />
));
