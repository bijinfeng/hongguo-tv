import { host, mount } from 'nsh';
import { NativeApp } from '@hongguo/app';
import { NativeCore } from 'hongguo-tv/native';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';

mount(() => (
  <NativeApp
    target="tv"
    logoMark={logoMark}
    runtime={runtime}
    openCore={() => NativeCore.open()}
    subscribePlayerCommands={(receive) => host.on('player-command', receive)}
  />
));
