import { View } from 'nsh';
import { Button, CardControls, type IconName } from '@hongguo/ui';
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
];

const desktopLibrary: NavItem[] = [
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
    name: 'discover',
    label: '找剧',
    testID: 'nav-discover',
    selected: (store) => store.activePage('discover') || store.activePage('search'),
  },
  {
    name: 'rankings',
    label: '排行榜',
    testID: 'nav-rank',
    selected: (store) => store.activePage('rankings'),
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
 * Desktop groups follow the draft; one toolbar keeps arrow navigation across groups.
 */
export function Navigation(props: { store: Store; layout: 'desktop' | 'tv' }) {
  const groups = () =>
    props.layout === 'tv'
      ? [{ label: '主导航', items: tvRail }]
      : [
          { label: '主要导航', items: desktopRail },
          { label: '我的片单', items: desktopLibrary },
        ];
  return (
    <CardControls
      label="主导航"
      onNavigate={props.store.noteFocusIntent}
      vertical={props.layout === 'desktop'}
      class={props.layout === 'tv' ? 'items-center' : undefined}
      gap={props.layout === 'tv' ? 17 : 34}
    >
      <Each of={groups()} key={(group) => group.label}>
        {(group) => (
          <View
            role="group"
            accessibilityLabel={group().label}
            class={props.layout === 'tv' ? 'flex-row items-center' : 'flex-col'}
            style={{ gap: props.layout === 'tv' ? 17 : 8 }}
          >
            <Each of={group().items} key={(item) => item.name}>
              {(item) => {
                // The store's reactive getters must be read inside the binding, not once per row,
                // or the rail keeps whichever section was current when the row first rendered.
                const on = () => item().selected(props.store);
                return (
                  <Button
                    testID={item().testID}
                    buttonRef={(ref) => props.store.primaryRef(item().name, ref)}
                    variant={props.layout === 'tv' ? 'quiet' : 'navigation'}
                    align={props.layout === 'tv' ? 'center' : 'start'}
                    icon={item().icon}
                    label={item().label}
                    current={on()}
                    class={
                      props.layout === 'desktop'
                        ? 'w-full justify-start'
                        : `rounded-none border-b-2 ${on() ? 'border-b-foreground' : 'border-b-transparent'}`
                    }
                    onPress={() => props.store.navigate(item().name)}
                  />
                );
              }}
            </Each>
          </View>
        )}
      </Each>
    </CardControls>
  );
}
