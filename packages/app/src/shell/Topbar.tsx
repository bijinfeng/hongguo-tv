import { View, windowSize } from 'nsh';
import { Button, Controls, UiText } from '@hongguo/ui';
import { SearchForm } from '../SearchForm';
import type { Section, Store } from '../store';

const breadcrumbs: { section: Section; label: string }[] = [
  { section: 'home', label: '发现' },
  { section: 'feed', label: '刷剧' },
  { section: 'discover', label: '找剧' },
  { section: 'search', label: '找剧' },
  { section: 'history', label: '观看记录' },
  { section: 'following', label: '追更' },
  { section: 'reservations', label: '预约' },
  { section: 'notifications', label: '更新提醒' },
  { section: 'rankings', label: '排行榜' },
  { section: 'calendar', label: '上新日历' },
];

/** Draft inline padding: 24px to 64px across the window width. */
const inset = () => Math.min(64, Math.max(24, windowSize().width * 0.035));

/** Design draft: 86px bar, page crumb, 360px search, account actions. */
export function Topbar(props: { store: Store }) {
  const crumb = () => breadcrumbs.find((entry) => props.store.activePage(entry.section))?.label;
  return (
    <View class="flex-row items-center gap-6" style={{ height: 86, paddingHorizontal: inset() }}>
      <View style={{ minWidth: 100 }}>
        <UiText role="meta">{crumb() ?? ''}</UiText>
      </View>
      <View class="flex-1" style={{ maxWidth: 360, marginLeft: 'auto' }}>
        <SearchForm store={props.store} />
      </View>
      <Controls label="账号与记录">
        <Button
          icon="history"
          iconOnly
          variant="quiet"
          label="观看记录"
          onPress={() => props.store.navigate('history')}
        />
        <Button
          icon="user"
          variant="quiet"
          compact
          label={props.store.account()?.profile?.name || '登录'}
          onPress={props.store.accountPage}
        />
      </Controls>
    </View>
  );
}
