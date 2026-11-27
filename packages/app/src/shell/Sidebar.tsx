import { View } from 'nsh';
import { Button, CardControls, radius } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';
import { Settings, User } from 'nsh-icon-lucide';

/**
 * Direction C rail geometry: 176 wide, 24 inline, 34 between blocks. The top inset is smaller than
 * the draft's 30 because the brand moved into the window's title bar, so the rail is navigation
 * only and starts right below it.
 */
const geometry = { width: 176, top: 16, inline: 17, bottom: 22, gap: 34 };
/** Direction C rail entries are capsules; the size metrics keep their own radius. Read inside the
 * binding: `radius` resolves through the current theme, so it must not be captured at module load. */
const capsule = () => ({ borderRadius: radius('full') });
/** Desktop and web outer rail: primary destinations and account. */
export function Sidebar(props: { store: Store }) {
  return (
    <View
      class="bg-card"
      style={{
        width: geometry.width,
        paddingTop: geometry.top,
        paddingHorizontal: geometry.inline,
        paddingBottom: geometry.bottom,
        gap: geometry.gap,
      }}
    >
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
          style={capsule()}
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
          style={capsule()}
          onPress={() => props.store.settingsPage()}
        />
      </CardControls>
    </View>
  );
}
