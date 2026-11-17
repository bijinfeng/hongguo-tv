import { Button, CardControls, tvUnit, type IconName } from '@hongguo/ui';
import type { Section, Store } from '../store';

type NavItem = {
  name: Section;
  label: string;
  icon?: IconName;
  testID: string;
  selected: (store: Store) => boolean;
};

/** Desktop and web rail order from the design draft, with the draft's own labels. */
const desktopRail: NavItem[] = [
  {
    name: 'home',
    label: '发现',
    icon: 'home',
    testID: 'nav-home',
    selected: (store) => store.activePage('home'),
  },
  {
    name: 'feed',
    label: '刷剧',
    icon: 'play',
    testID: 'nav-feed',
    selected: (store) => store.activePage('feed'),
  },
  {
    name: 'discover',
    label: '找剧',
    icon: 'search',
    testID: 'nav-discover',
    selected: (store) => store.activePage('discover') || store.activePage('search'),
  },
  {
    name: 'rankings',
    label: '排行榜',
    icon: 'chart-no-axes-column-increasing',
    testID: 'nav-rank',
    selected: (store) => store.activePage('rankings'),
  },
  {
    name: 'calendar',
    label: '上新日历',
    icon: 'calendar-days',
    testID: 'nav-calendar',
    selected: (store) => store.activePage('calendar'),
  },
  {
    name: 'history',
    label: '观看记录',
    icon: 'history',
    testID: 'nav-history',
    selected: (store) => store.activePage('history'),
  },
  {
    name: 'following',
    label: '追更',
    icon: 'bell',
    testID: 'nav-following',
    selected: (store) => store.activePage('following'),
  },
  {
    name: 'notifications',
    label: '更新提醒',
    icon: 'bell',
    testID: 'nav-notifications',
    selected: (store) => store.activePage('notifications'),
  },
];

/** TV header order from the design draft: five tabs, history folds the account pages. */
const tvRail: NavItem[] = [
  {
    name: 'home',
    label: '发现',
    testID: 'nav-home',
    selected: (store) => store.activePage('home'),
  },
  {
    name: 'feed',
    label: '刷剧',
    testID: 'nav-feed',
    selected: (store) => store.activePage('feed'),
  },
  {
    name: 'discover',
    label: '找剧',
    testID: 'nav-discover',
    selected: (store) => store.activePage('discover') || store.activePage('search'),
  },
  {
    name: 'history',
    label: '观看记录',
    testID: 'nav-history',
    selected: (store) =>
      store.activePage('history') ||
      store.activePage('following') ||
      store.activePage('reservations') ||
      store.activePage('notifications'),
  },
];

/**
 * Primary navigation shared by the desktop rail and the TV header.
 * `layout` picks the draft order and labels; the focus group stays one toolbar.
 */
export function Navigation(props: { store: Store; layout: 'desktop' | 'tv' }) {
  const items = () => (props.layout === 'tv' ? tvRail : desktopRail);
  return (
    <CardControls
      label="主导航"
      onNavigate={props.store.noteFocusIntent}
      vertical={props.layout === 'desktop'}
      class={props.layout === 'tv' ? 'items-center' : undefined}
      gap={props.layout === 'tv' ? tvUnit(34) : 8}
    >
      <Each of={items()} key={(item) => item.name}>
        {(item) => {
          const on = item().selected(props.store);
          return (
            <Button
              testID={item().testID}
              buttonRef={(ref) => props.store.primaryRef(item().name, ref)}
              variant={props.layout === 'tv' ? 'quiet' : 'navigation'}
              icon={item().icon}
              label={item().label}
              current={on}
              class={
                props.layout === 'desktop'
                  ? 'w-full justify-start'
                  : `rounded-none border-b-2 ${on ? 'border-b-foreground' : 'border-b-transparent'}`
              }
              onPress={() => props.store.navigate(item().name)}
            />
          );
        }}
      </Each>
    </CardControls>
  );
}
