import { mount } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import logoMark from './assets/hongguo-logo.png';
configureClient('http://127.0.0.1:18997');
mount(() => <App target="tv" logoMark={logoMark} />);
