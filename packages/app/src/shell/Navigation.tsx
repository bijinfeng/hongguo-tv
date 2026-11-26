import {
  Bell,
  BellRing,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  History,
  House,
  Search,
} from 'nsh-icon-lucide';
import { View } from 'nsh';
import { CardControls, NavigationItem, radius } from '@hongguo/ui';
import type { Section, Store } from '../store';

type NavItem = {
  name: Section;
  label: string;
  icon?: string;
  testID: string;
  selected: (store: Store) => boolean;
  onPress?: (store: Store) => void;
};

/** Desktop and web rail order from the design draft, with the draft's own labels. */
const desktopRail: NavItem[] = [
  {
    name: 'home',
    label: '发现',
    icon: House,
    testID: 'nav-home',
    selected: (store) => store.activePage('home'),
  },
  {
    name: 'discover',
    label: '找剧',
    icon: Search,
    testID: 'nav-discover',
    selected: (store) => store.activePage('discover') || store.activePage('search'),
  },
  {
    name: 'rankings',
    label: '排行榜',
    icon: ChartNoAxesColumnIncreasing,
    testID: 'nav-rank',
    selected: (store) => store.activePage('rankings'),
  },
  {
    name: 'calendar',
    label: '上新日历',
    icon: CalendarDays,
    testID: 'nav-calendar',
    selected: (store) => store.activePage('calendar'),
  },
];

const desktopLibrary: NavItem[] = [
  {
    name: 'history',
    label: '观看记录',
    icon: History,
    testID: 'nav-history',
    selected: (store) => store.activePage('history'),
  },
  {
    name: 'following',
    label: '追更',
    icon: Bell,
    testID: 'nav-following',
    selected: (store) => store.activePage('following'),
  },
  {
    name: 'notifications',
    label: '更新提醒',
    icon: BellRing,
    testID: 'nav-notifications',
    selected: (store) => store.activePage('notifications'),
  },
];

/** TV primary destinations; tools and secondary destinations keep their own routes. */
const tvRail: NavItem[] = [
  {
    name: 'home',
    label: '精选',
    testID: 'nav-home',
    selected: (store) => store.activePage('home'),
  },
  {
    name: 'discover',
    label: '找剧',
    testID: 'nav-discover',
    selected: (store) => store.activePage('discover') || store.activePage('calendar'),
  },
  {
    name: 'rankings',
    label: '榜单',
    testID: 'nav-rank',
    selected: (store) => store.activePage('rankings'),
  },
  {
    name: 'mine',
    label: '我的',
    testID: 'nav-mine',
    selected: (store) =>
      store.nav.routes().at(-1)?.name === 'account' ||
      store.activePage('mine') ||
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
      gap={props.layout === 'tv' ? 12 : 34}
    >
      <Each of={groups()} key={(group) => group.label}>
        {(group) => (
          <View
            role="group"
            accessibilityLabel={group().label}
            class={props.layout === 'tv' ? 'flex-row flex-wrap items-center' : 'flex-col'}
            style={{ gap: props.layout === 'tv' ? 12 : 8 }}
          >
            <Each of={group().items} key={(item) => item.name}>
              {(item) => {
                // The store's reactive getters must be read inside the binding, not once per row,
                // or the rail keeps whichever section was current when the row first rendered.
                const on = () => item().selected(props.store);
                // Both bars carry `current`; the TV top bar asks for the contrast pairing so the
                // destination reads as a filled pill at TV distance, while the desktop rail keeps
                // the muted shared surface.
                // The desktop rail's capsule is direction C's geometry; the TV header keeps the
                // shared control radius so its own 48dp recipe is untouched.
                return (
                  <NavigationItem
                    presentation={props.layout === 'tv' ? 'bar' : 'rail'}
                    testID={item().testID}
                    buttonRef={(ref) => props.store.primaryRef(item().name, ref)}
                    align={props.layout === 'desktop' ? 'center' : undefined}
                    icon={item().icon}
                    label={item().label}
                    current={on()}
                    currentSurface={props.layout === 'tv' ? 'contrast' : undefined}
                    class={props.layout === 'desktop' ? 'w-full justify-start' : undefined}
                    style={props.layout === 'desktop' ? { borderRadius: radius('full') } : undefined}
                    onPress={() => {
                      if (item().onPress) item().onPress!(props.store);
                      else props.store.navigate(item().name);
                    }}
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
