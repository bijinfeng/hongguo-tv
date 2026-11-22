import { Segmented, Select, SettingsRow, SettingsSection } from '@hongguo/ui';
import type { Store } from '../../store';
import type { ThemeMode } from '../../settings';

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '深色' },
  { value: 'light', label: '浅色' },
];

/** Appearance preference; the theme is applied by the settings owner as it changes. */
export function SettingsAppearance(props: { store: Store }) {
  const settings = props.store.settings;
  const tv = () => props.store.target === 'tv';
  return (
    <SettingsSection title="外观">
      <SettingsRow
        label="界面主题"
        testID="settings-theme-row"
        error={
          props.store.settings.failedKey() === 'theme' ? props.store.settings.error() : undefined
        }
      >
        {/* TV lays the short option set on the row itself: a popup makes the remote travel to
            it and back. Desktops keep the compact anchored select. */}
        <If
          when={tv()}
          else={
            <Select
              label="界面主题"
              value={settings.theme()}
              options={themeOptions}
              disabled={!settings.loaded()}
              onChange={(event) => settings.setTheme((event.value as ThemeMode) ?? 'system')}
              testID="settings-theme"
              style={{ minWidth: 200 }}
            />
          }
        >
          <Segmented
            label="界面主题"
            value={settings.theme()}
            options={themeOptions}
            disabled={!settings.loaded()}
            onChange={(event) => settings.setTheme((event.value as ThemeMode) ?? 'system')}
            testID="settings-theme"
          />
        </If>
      </SettingsRow>
    </SettingsSection>
  );
}
