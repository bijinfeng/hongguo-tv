import { Scroll, View, signal } from 'nsh';
import { BackButton, CardControls, NavigationItem, Notice, UiText, space } from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { diagnosticsAvailable } from '../diagnostics';
import { SettingsAccount } from './settings/account';
import { SettingsAppearance } from './settings/appearance';
import { SettingsDiagnostics } from './settings/diagnostics';
import { SettingsInformation } from './settings/information';
import { SettingsLocalData } from './settings/local-data';
import { SettingsPlayback } from './settings/playback';
import { SettingsUpdates } from './settings/updates';

type SettingsPanel =
  | 'appearance'
  | 'playback'
  | 'account'
  | 'updates'
  | 'local-data'
  | 'diagnostics'
  | 'about'
  | 'support'
  | 'recommendations';
const panels: { id: SettingsPanel; label: string }[] = [
  { id: 'appearance', label: '外观' },
  { id: 'playback', label: '播放' },
  { id: 'account', label: '账号' },
  { id: 'updates', label: '应用更新' },
  { id: 'local-data', label: '本机数据' },
  { id: 'diagnostics', label: '诊断数据' },
  { id: 'about', label: '关于' },
  { id: 'support', label: '支持与打赏' },
  { id: 'recommendations', label: '应用推荐' },
];

/** TV modules keep their controls in a bounded content pane; preference state stays in the store. */
export function SettingsPage(props: { store: Store; updates?: Updates; tv: boolean }) {
  const panel = signal<SettingsPanel>('appearance');
  const readingInformation = () => props.tv && panel() === 'about';
  return (
    <View
      testID="settings-page"
      class="flex-1 min-h-0"
      style={{ gap: space('md'), padding: props.tv ? 0 : space('lg') }}
    >
      <View class="flex-row flex-wrap items-center" style={{ gap: space('md') }}>
        <BackButton
          testID="settings-back"
          label={props.store.backLabel()}
          onPress={props.store.back}
        />
        <UiText role="page">设置</UiText>
      </View>
      <If when={props.store.settings.error() && !props.store.settings.failedKey()}>
        <Notice
          error
          message={props.store.settings.error()}
          retry={props.store.settings.retry}
          testID="settings-save-error"
        />
      </If>
      <View
        class={props.tv ? 'flex-1 min-h-0 flex-row' : 'flex-1 min-h-0'}
        style={{ gap: space('lg') }}
      >
        <If when={props.tv}>
          <Scroll
            testID="settings-navigation"
            class="min-h-0"
            style={{ width: 176 }}
            contentStyle={{ padding: 6 }}
          >
            <CardControls
              label="设置分类"
              vertical
              onNavigate={props.store.noteFocusIntent}
              gap={space('xs')}
            >
              <Each
                of={panels.filter(
                  (item) =>
                    (item.id !== 'updates' || !!props.updates) &&
                    (item.id !== 'diagnostics' || diagnosticsAvailable()),
                )}
                key={(item) => item.id}
              >
                {(item) => (
                  <NavigationItem
                    testID={`settings-panel-${item().id}`}
                    label={item().label}
                    current={panel() === item().id}
                    align="start"
                    class="w-full"
                    onPress={() => panel.set(item().id)}
                  />
                )}
              </Each>
            </CardControls>
          </Scroll>
        </If>
        <View
          testID={readingInformation() ? 'focus-region-settings-information' : undefined}
          focusable={readingInformation()}
          role={readingInformation() ? 'region' : undefined}
          accessibilityLabel={readingInformation() ? '关于内容' : undefined}
          class="flex-1 min-h-0"
        >
          <Scroll
            testID="settings-content"
            class="flex-1 min-h-0"
            contentStyle={{ padding: props.tv ? 6 : 0 }}
          >
            <View style={{ gap: space('xl'), maxWidth: props.tv ? undefined : 800 }}>
              <If when={!props.tv || panel() === 'appearance'}>
                <SettingsAppearance store={props.store} />
              </If>
              <If when={!props.tv || panel() === 'playback'}>
                <SettingsPlayback store={props.store} tv={props.tv} />
              </If>
              <If when={!props.tv || panel() === 'account'}>
                <SettingsAccount store={props.store} />
              </If>
              <If when={props.updates && (!props.tv || panel() === 'updates')}>
                {() => (
                  <SettingsUpdates store={props.store} updates={props.updates!} tv={props.tv} />
                )}
              </If>
              <If when={!props.tv || panel() === 'local-data'}>
                <SettingsLocalData store={props.store} />
              </If>
              <If when={!props.tv || panel() === 'diagnostics'}>
                <SettingsDiagnostics store={props.store} />
              </If>
              <If
                when={
                  props.tv &&
                  (panel() === 'about' || panel() === 'support' || panel() === 'recommendations')
                }
              >
                <SettingsInformation page={panel()} updates={props.updates} />
              </If>
            </View>
          </Scroll>
        </View>
      </View>
    </View>
  );
}
