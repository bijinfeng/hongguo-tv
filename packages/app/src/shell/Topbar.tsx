import { View, type ImageAsset } from 'nsh';
import { Button, Controls, Logo, UiText } from '@hongguo/ui';
import { SearchForm } from '../SearchForm';
import { contentGutter } from './ContentColumn';
import { sectionLabels } from '../sections';
import type { Section, Store } from '../store';
import { AccountButton } from './AccountButton';
import { History } from 'nsh-icon-lucide';

/** Every browse section the title bar can name, in the order the crumb resolves them. */
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

/**
 * The title bar's content row: brand, page name, search and account actions. The window behaviour
 * around it (dragging, control insets, height) belongs to `TitleBar`; this row only decides order.
 */
export function Topbar(props: { store: Store; logoMark: ImageAsset }) {
  const crumb = () => {
    const section = sections.find((name) => props.store.activePage(name));
    return section ? sectionLabels[section] : '';
  };
  return (
    <View class="w-full flex-row items-center gap-3">
      <View class="flex-row items-center gap-3" style={{ paddingLeft: contentGutter() }}>
        <Logo mark={props.logoMark} size="compact" />
        <View style={{ minWidth: 60 }}>
          <UiText role="meta">{crumb() ?? ''}</UiText>
        </View>
      </View>
      <View class="flex-1" style={{ maxWidth: 360, marginLeft: 'auto' }}>
        <SearchForm store={props.store} />
      </View>
      <View class="flex-row items-center" style={{ paddingRight: contentGutter() }}>
        <Controls label="账号与记录">
          <Button
            icon={History}
            iconOnly
            variant="quiet"
            label="观看记录"
            onPress={() => props.store.navigate('history')}
          />
          <AccountButton store={props.store} testID="topbar-account" />
        </Controls>
      </View>
    </View>
  );
}
