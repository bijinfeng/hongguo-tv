import { Scroll, View } from 'nsh';
import { Notice, UiText, space } from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { SettingsAccount } from './settings/account';
import { SettingsAppearance } from './settings/appearance';
import { SettingsLocalData } from './settings/local-data';
import { SettingsPlayback } from './settings/playback';
import { SettingsUpdates } from './settings/updates';

/** Settings surface: the prototype's single column, extended only with preferences that act. */
export function SettingsPage(props: { store: Store; updates?: Updates; tv: boolean }) {
  return (
    <View testID="settings-page" class="flex-1 min-h-0">
      <Scroll class="flex-1">
        <View class={props.tv ? 'gap-6' : 'gap-6 p-5 md:p-8'}>
          <UiText role="page">设置</UiText>
          <If when={props.store.settings.error()}>
            <Notice
              error
              message={props.store.settings.error()}
              retry={props.store.settings.retry}
              testID="settings-save-error"
            />
          </If>
          <View style={{ gap: space('xl'), maxWidth: props.tv ? undefined : 800 }}>
            <SettingsAppearance store={props.store} />
            <SettingsPlayback store={props.store} tv={props.tv} />
            <SettingsAccount store={props.store} />
            <If when={props.updates}>
              {() => <SettingsUpdates store={props.store} updates={props.updates!} />}
            </If>
            <SettingsLocalData store={props.store} />
          </View>
        </View>
      </Scroll>
    </View>
  );
}
