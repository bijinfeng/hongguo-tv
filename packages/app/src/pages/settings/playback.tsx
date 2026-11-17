import { Product, Select, SettingsRow, SettingsSection, Switch, tvUnit } from '@hongguo/ui';
import type { Store } from '../../store';
import { PLAYBACK_RATES, type PlaybackRate } from '../../settings';

const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);

const rateOptions = PLAYBACK_RATES.map((rate) => ({ value: rate, label: `${rate}×` }));

/** Playback preferences that the player reads when it opens or finishes an episode. */
export function SettingsPlayback(props: { store: Store; tv: boolean }) {
  const settings = props.store.settings;
  return (
    <SettingsSection title="播放">
      <SettingsRow
        label="自动播放下一集"
        description="当前剧集播完后继续播放下一集。"
        testID="settings-autoplay-row"
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
      >
        <Select
          label="默认倍速"
          value={settings.defaultRate()}
          options={rateOptions}
          disabled={!settings.loaded()}
          onChange={(event) => settings.setDefaultRate((event.value as PlaybackRate) ?? '1')}
          testID="settings-rate"
          style={{ minWidth: unit(200) }}
        />
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
