import { View, type ImageAsset } from 'nsh';
import { Button, IconButton, Logo } from '@hongguo/ui';
import type { Store } from '../store';
import { Navigation } from './Navigation';

/** Four destinations and two tools; account identity belongs to Mine. */
export function TvHeader(props: { store: Store; logoMark: ImageAsset }) {
  return (
    <View
      class="flex-row flex-wrap items-center"
      style={{ minHeight: 52, gap: 20, paddingBottom: 12 }}
    >
      <Logo mark={props.logoMark} />
      <View style={{ flexGrow: 1, flexShrink: 0, flexBasis: 'max-content', maxWidth: '100%' }}>
        <Navigation store={props.store} layout="tv" />
      </View>
      <View class="flex-row items-center" style={{ gap: 8, marginLeft: 'auto' }}>
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
          buttonRef={(ref) => props.store.primaryRef('settings', ref)}
          onPress={() => props.store.settingsPage()}
        />
      </View>
    </View>
  );
}
