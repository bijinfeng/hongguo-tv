import { View, cleanup, signal } from 'nsh';
import { Button, Logo, UiText, controlMetrics } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';
import type { ImageAsset } from 'nsh';

/** TV header geometry in points (the 132/88/112/56 draft halved to device points). */
const geometry = { header: 66, inline: 44, gap: 56, actions: 28 };
/** The icon rail fills the header's line height so every element shares one visual centre. */
const actionBox = () => controlMetrics().height;

function clock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Draft help line under the TV content area. */
export function TvHelp() {
  return (
    <View
      class="flex-row items-center border-t border-border"
      style={{ height: 37.5, paddingHorizontal: 44 }}
    >
      {/* Remote-only surface: name the remote's own keys, never a keyboard's. */}
      <UiText role="meta">方向键 移动焦点 · 确认 进入 · 返回键 返回</UiText>
    </View>
  );
}

/** TV outer header: brand, primary tabs, search, account and clock. */
export function TvHeader(props: { store: Store; logoMark: ImageAsset }) {
  const time = signal(clock());
  const timer = setInterval(() => time.set(clock()), 30_000);
  cleanup(() => clearInterval(timer));
  return (
    <View
      class="flex-row items-center"
      style={{
        height: geometry.header,
        paddingHorizontal: geometry.inline,
        gap: geometry.gap,
      }}
    >
      <Logo mark={props.logoMark} />
      <View class="flex-1">
        <Navigation store={props.store} layout="tv" />
      </View>
      <View class="flex-row items-center" style={{ gap: 14 }}>
        <View style={{ width: actionBox(), height: actionBox() }}>
          <Button
            testID="nav-search"
            icon="search"
            iconOnly
            variant="quiet"
            label="搜索短剧"
            buttonRef={(ref) => props.store.primaryRef('search', ref)}
            onPress={props.store.openSearch}
          />
        </View>
        <View style={{ width: actionBox(), height: actionBox() }}>
          <Button
            testID="nav-settings"
            icon="settings"
            iconOnly
            variant="quiet"
            label="设置"
            onPress={() => props.store.settingsPage()}
          />
        </View>
        <View style={{ width: actionBox(), height: actionBox() }}>
          <Button
            icon="user"
            iconOnly
            variant="quiet"
            label={props.store.account()?.profile?.name || '账号'}
            onPress={props.store.accountPage}
          />
        </View>
        {/* The clock keeps its own lane: the icon rail's focus ring and pill need breathing room. */}
        <View
          class="items-center justify-center"
          style={{ minWidth: 56, paddingLeft: 16, height: actionBox() }}
        >
          <UiText role="numeric">{time()}</UiText>
        </View>
      </View>
    </View>
  );
}
