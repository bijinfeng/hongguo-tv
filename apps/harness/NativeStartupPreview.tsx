import { mount } from 'nsh';
import { NativeStartupFixture } from '@hongguo/app/testing/native-startup';
import logoMark from './assets/hongguo-logo.png';
mount(() => <NativeStartupFixture logoMark={logoMark} />);
