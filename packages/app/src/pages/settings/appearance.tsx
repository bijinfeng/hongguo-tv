import { Product, Select, SettingsRow, SettingsSection, tvUnit } from '@hongguo/ui';
import type { Store } from '../../store';
import type { ThemeMode } from '../../settings';

const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '深色模式' },
  { value: 'light', label: '纸张浅色' },
];

/** Appearance preference; the theme is applied by the settings owner as it changes. */
export function SettingsAppearance(props: { store: Store }) {
  const settings = props.store.settings;
  return (
    <SettingsSection title="外观">
      <SettingsRow
        label="界面主题"
        description="跟随系统外观，或者固定深色和纸张浅色。"
        testID="settings-theme-row"
      >
        <Select
          label="界面主题"
          value={settings.theme()}
          options={themeOptions}
          disabled={!settings.loaded()}
          onChange={(event) => settings.setTheme((event.value as ThemeMode) ?? 'system')}
          testID="settings-theme"
          style={{ minWidth: unit(200) }}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
