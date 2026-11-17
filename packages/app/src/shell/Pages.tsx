import { View, reduceMotion } from 'nsh';
import { NavStack, NavPage } from 'nsh/base';
import { Button, tvUnit } from '@hongguo/ui';
import type { Store } from '../store';
import type { Updates } from '../updates';
import { UpdatesPage } from '../pages/Updates';
import { Search } from '../pages/Search';
import { Discover } from '../pages/Discover';
import { Actor } from '../pages/Actor';
import { Detail } from '../pages/Detail';
import { Player } from '../pages/Player';
import { History } from '../pages/History';
import { Following } from '../pages/Following';
import { Reservations } from '../pages/Reservations';
import { Notifications } from '../pages/Notifications';
import { Account } from '../pages/Account';
import { Home } from '../pages/Home';
import { Feed } from '../pages/Feed';
import { Calendar } from '../pages/Calendar';
import { Rankings } from '../pages/Rankings';

function Browse(props: { store: Store }) {
  // Keep page-local lists, anchors and refs alive; hidden sections have no input targets.
  return (
    <View testID={`browse-section-${props.store.section()}`} class="flex-1 min-h-0">
      <View
        class={props.store.section() === 'home' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'home'}
        disabled={props.store.section() !== 'home'}
      >
        <Home store={props.store} />
      </View>
      <View
        class={props.store.section() === 'search' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'search'}
        disabled={props.store.section() !== 'search'}
      >
        <Search store={props.store} />
      </View>
      <View
        class={props.store.section() === 'discover' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'discover'}
        disabled={props.store.section() !== 'discover'}
      >
        <Discover store={props.store} />
      </View>
      <View
        class={props.store.section() === 'history' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'history'}
        disabled={props.store.section() !== 'history'}
      >
        <History store={props.store} />
      </View>
      <View
        class={props.store.section() === 'following' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'following'}
        disabled={props.store.section() !== 'following'}
      >
        <Following store={props.store} />
      </View>
      <View
        class={props.store.section() === 'reservations' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'reservations'}
        disabled={props.store.section() !== 'reservations'}
      >
        <Reservations store={props.store} />
      </View>
      <View
        class={props.store.section() === 'notifications' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'notifications'}
        disabled={props.store.section() !== 'notifications'}
      >
        <Notifications store={props.store} />
      </View>
      <View
        class={props.store.section() === 'calendar' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'calendar'}
        disabled={props.store.section() !== 'calendar'}
      >
        <Calendar
          calendar={props.store.calendar}
          reservation={props.store}
          target={props.store.target}
          active={props.store.activePage('calendar')}
          onOpen={props.store.open}
          onSource={props.store.rememberSource}
          onNavigate={props.store.noteFocusIntent}
          focusGuard={props.store.focusGuard}
          onRegisterBack={props.store.registerCalendarBack}
          onPrimary={(ref) => props.store.primaryRef('calendar', ref)}
        />
      </View>
      <View
        class={props.store.section() === 'rankings' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'rankings'}
        disabled={props.store.section() !== 'rankings'}
      >
        <Rankings
          rankings={props.store.rankings}
          radar={props.store.radar}
          view={props.store.rankingView()}
          onView={props.store.selectRankingView}
          target={props.store.target}
          active={props.store.activePage('rankings')}
          onOpen={props.store.open}
          onActor={props.store.openActor}
          onSource={props.store.rememberSource}
          onNavigate={props.store.noteFocusIntent}
          focusGuard={props.store.focusGuard}
          onPrimary={(ref) => props.store.primaryRef('rankings', ref)}
        />
      </View>
      <View
        class={props.store.section() === 'feed' ? 'flex-1' : 'hidden'}
        accessibilityElementsHidden={props.store.section() !== 'feed'}
        disabled={props.store.section() !== 'feed'}
      >
        <Feed store={props.store} />
      </View>
    </View>
  );
}
export function Pages(props: { store: Store; updates?: Updates }) {
  return (
    <NavStack
      state={props.store.nav}
      class="flex-1 min-h-0"
      onChange={() => props.store.restoreFocus()}
    >
      {(route) => (
        <NavPage
          class="flex-1 min-h-0 bg-background"
          headerVisible={false}
          popOnBack={
            route.name !== 'player' &&
            !(route.name === 'browse' && props.store.target === 'desktop')
          }
          onBackPress={() => {
            if (
              route.name === 'player' ||
              (route.name === 'browse' && props.store.target === 'desktop')
            )
              props.store.back();
          }}
          animation={props.store.target === 'tv' || reduceMotion() ? 'none' : 'default'}
        >
          <View
            testID={`navigation-page-${props.store.nav.routes().indexOf(route)}`}
            class="flex-1 min-h-0 bg-background"
            style={{ visibility: props.store.nav.routes().at(-1) === route ? 'visible' : 'hidden' }}
            accessibilityElementsHidden={props.store.nav.routes().at(-1) !== route}
            disabled={props.store.nav.routes().at(-1) !== route}
          >
            <If when={route.name !== 'browse' && route.name !== 'player'}>
              <View
                class={
                  props.store.target === 'desktop' ? 'px-10 pt-6 pb-3 items-start' : 'items-start'
                }
                style={
                  props.store.target === 'tv'
                    ? { paddingTop: tvUnit(24), paddingBottom: tvUnit(12) }
                    : undefined
                }
              >
                <Button
                  variant="quiet"
                  compact
                  icon="back"
                  label="返回"
                  onPress={() => props.store.nav.pop()}
                />
              </View>
            </If>
            <If when={route.name === 'browse'}>
              <Browse store={props.store} />
            </If>
            <If when={route.name === 'detail'}>
              {() => (
                <Detail
                  drama={(route as Extract<typeof route, { name: 'detail' }>).drama}
                  autoplay={(route as Extract<typeof route, { name: 'detail' }>).autoplay}
                  store={props.store}
                  active={props.store.nav.routes().at(-1) === route}
                />
              )}
            </If>
            <If when={route.name === 'actor'}>
              {() => (
                <Actor
                  store={props.store}
                  actorId={(route as Extract<typeof route, { name: 'actor' }>).actorId}
                  title={(route as Extract<typeof route, { name: 'actor' }>).title}
                  active={props.store.nav.routes().at(-1) === route}
                />
              )}
            </If>
            <If when={route.name === 'player'}>
              {() => (
                <Player
                  drama={(route as Extract<typeof route, { name: 'player' }>).drama}
                  episode={(route as Extract<typeof route, { name: 'player' }>).episode}
                  store={props.store}
                  active={props.store.nav.routes().at(-1) === route}
                />
              )}
            </If>
            <If when={route.name === 'updates' && props.updates}>
              <UpdatesPage
                updates={props.updates!}
                tv={props.store.target === 'tv'}
                active={props.store.nav.routes().at(-1) === route}
                focusGuard={props.store.focusGuard}
              />
            </If>
            <If when={route.name === 'account'}>
              <Account
                store={props.store}
                openUpdates={
                  props.updates
                    ? (restore) => {
                        props.store.openUpdates(restore);
                      }
                    : undefined
                }
                openNotifications={() => {
                  props.store.navigate('notifications');
                  props.store.restoreFocus();
                }}
              />
            </If>
          </View>
        </NavPage>
      )}
    </NavStack>
  );
}
