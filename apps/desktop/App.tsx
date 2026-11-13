import { mount } from 'nsh';
import { NativeApp } from '@hongguo/app';
import { NativeCore } from 'hongguo-desktop/native';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';

mount(() => (
  <NativeApp
    target="desktop"
    logoMark={logoMark}
    runtime={runtime}
    openCore={() => NativeCore.open()}
  />
));
