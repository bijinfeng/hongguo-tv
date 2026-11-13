import { mount } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';

configureClient(runtime.coreOrigin);
mount(() => <App target="desktop" logoMark={logoMark} />);
