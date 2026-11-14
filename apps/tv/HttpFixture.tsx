import { host, mount } from 'nsh';
import { subscribeFocus } from './focus';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import logoMark from './assets/hongguo-logo.png';

// Explicit headless HTTP fixture; product packaging always uses App.tsx.
configureClient('http://127.0.0.1:18997');
mount(() => (
  <App
    target="tv"
    logoMark={logoMark}
    subscribeFocus={subscribeFocus}
    subscribePlayerCommands={(receive) => host.on('player-command', receive)}
  />
));
