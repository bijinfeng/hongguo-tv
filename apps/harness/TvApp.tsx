import { mount, setTheme } from 'nsh';
import { App } from '@hongguo/app';
import { configureClient } from '@hongguo/core-client';
import runtime from './runtime.generated.json';
import logoMark from './assets/hongguo-logo.png';
import tvTheme from '../../packages/ui/theme.tv.json';

// The TV product target, developed on the web harness. `apps/tv` cannot serve this: its Rust crate
// does not build for wasm (tokio's mio has no wasm target), so the TV surface is developed and
// reviewed here and accepted on the device.
//
// A theme is a manifest property, not a prop, so `nsh.json` carries the desktop one; `setTheme`
// swaps in `theme.tv.json` before the first frame, which is the same file `apps/tv` builds with.
// Both halves are needed: `target` chooses `TvShell` and the TV interaction model, the theme
// chooses TV density. Setting only one gives a layout that is not what ships.
setTheme({ cssVars: tvTheme.cssVars });
configureClient(runtime.coreOrigin);
mount(() => <App target="tv" logoMark={logoMark} />);
