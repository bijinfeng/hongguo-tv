import { View, windowSize } from 'nsh';
import { Button, Controls, UiText } from '@hongguo/ui';
import { SearchForm } from '../SearchForm';
import { sectionLabels } from '../sections';
import type { Section, Store } from '../store';
import { AccountButton } from './AccountButton';

/** Every browse section the topbar can show, in the order the crumb resolves them. */
const sections: Section[] = [
  'home',
  'discover',
  'search',
  'history',
  'following',
  'reservations',
  'notifications',
  'rankings',
  'calendar',
];

/** Draft inline padding: 24px to 64px across the window width. */
const inset = () => Math.min(64, Math.max(24, windowSize().width * 0.035));

/** Design draft: 86px bar, page crumb, 360px search, account actions. */
export function Topbar(props: { store: Store }) {
  const crumb = () => {
    const section = sections.find((name) => props.store.activePage(name));
    return section ? sectionLabels[section] : '';
  };
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
        <AccountButton store={props.store} testID="topbar-account" />
      </Controls>
    </View>
  );
}
