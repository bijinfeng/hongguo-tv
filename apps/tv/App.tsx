import { mount } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import runtime from './runtime.generated.json';

configureClient(runtime.coreOrigin);
mount(App);
