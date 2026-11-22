import { Segmented, Select, SettingsRow, SettingsSection, Switch } from '@hongguo/ui';
import type { Store } from '../../store';
import { PLAYBACK_RATES, type PlaybackRate } from '../../settings';

const rateOptions = PLAYBACK_RATES.map((rate) => ({ value: rate, label: `${rate}×` }));

/** Playback preferences that the player reads when it opens or finishes an episode. */
export function SettingsPlayback(props: { store: Store; tv: boolean }) {
  const settings = props.store.settings;
  /** Only a write failure is this row's; a read failure stays in the page notice. */
  const rowError = (key: 'autoplayNext' | 'rememberPosition' | 'defaultRate') =>
    settings.failedKey() === key ? settings.error() : undefined;
  return (
    <SettingsSection title="播放">
      <SettingsRow
        label="自动播放下一集"
        testID="settings-autoplay-row"
        error={rowError('autoplayNext')}
      >
        <Switch
          label="自动播放下一集"
          labelHidden
          checked={settings.autoplayNext()}
          disabled={!settings.loaded()}
          onChange={(event) => settings.setAutoplayNext(event.checked)}
          testID="settings-autoplay"
        />
      </SettingsRow>
      <SettingsRow
        label="记住播放位置"
        description="重新打开剧集时从上次观看的位置继续。"
        testID="settings-remember-row"
        error={rowError('rememberPosition')}
      >
        <Switch
          label="记住播放位置"
          labelHidden
          checked={settings.rememberPosition()}
          disabled={!settings.loaded()}
          onChange={(event) => settings.setRememberPosition(event.checked)}
          testID="settings-remember"
        />
      </SettingsRow>
      <SettingsRow
        label="默认倍速"
        description="进入播放器时使用的初始速度。"
        testID="settings-rate-row"
        error={rowError('defaultRate')}
      >
        {/* TV lays the five short rates on the row itself; desktops keep the compact select. */}
        <If
          when={props.tv}
          else={
            <Select
              label="默认倍速"
              value={settings.defaultRate()}
              options={rateOptions}
              disabled={!settings.loaded()}
              onChange={(event) => settings.setDefaultRate((event.value as PlaybackRate) ?? '1')}
              testID="settings-rate"
              style={{ minWidth: 200 }}
            />
          }
        >
          <Segmented
            label="默认倍速"
            value={settings.defaultRate()}
            options={rateOptions}
            disabled={!settings.loaded()}
            onChange={(event) => settings.setDefaultRate((event.value as PlaybackRate) ?? '1')}
            testID="settings-rate"
          />
        </If>
      </SettingsRow>
      <If when={!props.tv}>
        <SettingsRow
          label="安静观看"
          description="播放时收起侧栏与顶栏，只保留画面和播放控件。"
          testID="settings-quiet-row"
        >
          <Switch
            label="安静观看"
            labelHidden
            checked={settings.quietWatching()}
            disabled={!settings.loaded()}
            onChange={(event) => settings.setQuietWatching(event.checked)}
            testID="settings-quiet"
          />
        </SettingsRow>
      </If>
    </SettingsSection>
  );
}
