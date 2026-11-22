import { View, cleanup, signal } from 'nsh';
import { Button, IconButton, Logo, UiText } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';
import type { ImageAsset } from 'nsh';

/** TV header geometry in points: the draft lane halved, with the approved pill-draft gaps. */
const geometry = { header: 66, inline: 44, gap: 36 };

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

/** TV outer header: brand, primary tabs, search, account and clock.
 * One control language: the tabs are pills, search keeps its label, settings and account are
 * icon squares on the shared bordered surface, and the clock is the lane's only bare text. */
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
      <View class="flex-row items-center" style={{ gap: 10 }}>
        <Button
          testID="nav-search"
          icon="search"
          label="搜索短剧"
          displayLabel="搜索"
          buttonRef={(ref) => props.store.primaryRef('search', ref)}
          onPress={props.store.openSearch}
        />
        <IconButton
          testID="nav-settings"
          icon="settings"
          label="设置"
          onPress={() => props.store.settingsPage()}
        />
        <IconButton
          icon="user"
          label={props.store.account()?.profile?.name || '账号'}
          onPress={props.store.accountPage}
        />
        {/* The clock keeps its own lane so a focus ring never crowds it. */}
        <View style={{ minWidth: 48, marginLeft: 6 }}>
          <UiText role="numeric">{time()}</UiText>
        </View>
      </View>
    </View>
  );
}
