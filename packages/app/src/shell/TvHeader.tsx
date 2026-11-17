import { View, cleanup, signal } from 'nsh';
import { Button, Logo, UiText, tvUnit } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';
import type { ImageAsset } from 'nsh';

/** Design draft: 132px header, 88px inline padding, 112px brand gap, 56px icon targets. */
const geometry = { header: 132, inline: 88, gap: 112, actions: 56 };

function clock(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Draft help line under the TV content area. */
export function TvHelp() {
  return (
    <View
      class="flex-row items-center border-t border-border"
      style={{ height: tvUnit(75), paddingHorizontal: tvUnit(88) }}
    >
      <UiText role="meta">方向键 移动焦点 · 确认 进入 · 返回 / Esc 返回</UiText>
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
        height: tvUnit(geometry.header),
        paddingHorizontal: tvUnit(geometry.inline),
        gap: tvUnit(geometry.gap),
      }}
    >
      <Logo mark={props.logoMark} />
      <View class="flex-1">
        <Navigation store={props.store} layout="tv" />
      </View>
      <View class="flex-row items-center" style={{ gap: tvUnit(25) }}>
        <View style={{ width: tvUnit(geometry.actions), height: tvUnit(geometry.actions) }}>
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
        <View style={{ width: tvUnit(geometry.actions), height: tvUnit(geometry.actions) }}>
          <Button
            testID="nav-settings"
            icon="settings"
            iconOnly
            variant="quiet"
            label="设置"
            onPress={() => props.store.settingsPage()}
          />
        </View>
        <View style={{ width: tvUnit(geometry.actions), height: tvUnit(geometry.actions) }}>
          <Button
            icon="user"
            iconOnly
            variant="quiet"
            label={props.store.account()?.profile?.name || '账号'}
            onPress={props.store.accountPage}
          />
        </View>
        <UiText role="numeric">{time()}</UiText>
      </View>
    </View>
  );
}
