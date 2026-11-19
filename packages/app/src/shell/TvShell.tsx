import { View, type ImageAsset } from 'nsh';
import {} from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { Pages } from './Pages';
import { TvHeader, TvHelp } from './TvHeader';

/** TV outer frame: header, content, remote help line; the player owns the whole screen. */
export function TvShell(props: { store: Store; logoMark: ImageAsset; updates?: Updates }) {
  const playing = () => props.store.playing();
  return (
    <View class="flex-1">
      <If when={!playing()}>
        <TvHeader store={props.store} logoMark={props.logoMark} />
      </If>
      {/* One 44dp lane for the header, the pages and the help line, as the TV draft sets them. */}
      <View class="flex-1 min-h-0" style={{ paddingHorizontal: playing() ? 0 : 44 }}>
        <Pages store={props.store} updates={props.updates} />
      </View>
      <If when={!playing()}>
        <TvHelp />
      </If>
    </View>
  );
}
