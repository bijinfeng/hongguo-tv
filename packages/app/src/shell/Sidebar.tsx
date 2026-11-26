import { View, type ImageAsset } from 'nsh';
import { Button, CardControls, Logo } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';
import { Settings, User } from 'nsh-icon-lucide';

/** Design draft geometry: 176px rail, 30px/17px/22px padding, 34px block gaps. */
const geometry = { width: 176, top: 30, inline: 17, bottom: 22, gap: 34 };
/** Desktop and web outer rail: brand, primary destinations, account. */
export function Sidebar(props: { store: Store; logoMark: ImageAsset }) {
  return (
    <View
      class="border-r border-border bg-background"
      style={{
        width: geometry.width,
        paddingTop: geometry.top,
        paddingHorizontal: geometry.inline,
        paddingBottom: geometry.bottom,
        gap: geometry.gap,
      }}
    >
      <View class="items-center" style={{ paddingHorizontal: 9 }}>
        <Logo mark={props.logoMark} size="compact" />
      </View>
      <View class="flex-1">
        <Navigation store={props.store} layout="desktop" />
      </View>
      <CardControls label="账号" onNavigate={props.store.noteFocusIntent} vertical>
        <Button
          variant="navigation"
          align="start"
          icon={User}
          label="我的账号"
          current={props.store.nav.routes().at(-1)?.name === 'account'}
          onPress={props.store.accountPage}
        />
        <Button
          variant="navigation"
          align="start"
          icon={Settings}
          label="设置"
          testID="nav-settings"
          current={props.store.nav.routes().at(-1)?.name === 'settings'}
          buttonRef={(ref) => props.store.primaryRef('settings', ref)}
          onPress={() => props.store.settingsPage()}
        />
      </CardControls>
    </View>
  );
}
