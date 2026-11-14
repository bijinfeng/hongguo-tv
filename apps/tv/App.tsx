import { host, mount } from 'nsh';
import { subscribeFocus } from './focus';
import { NativeApp } from '@hongguo/app';
import { NativeCore } from 'hongguo-tv/native';
import { tvUpdates } from './updates';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';

mount(() => (
  <NativeApp
    target="tv"
    logoMark={logoMark}
    runtime={runtime}
    updates={tvUpdates()}
    openCore={() => NativeCore.open()}
    subscribeFocus={subscribeFocus}
    subscribePlayerCommands={(receive) => host.on('player-command', receive)}
  />
));
