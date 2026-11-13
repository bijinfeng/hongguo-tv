import { Text, View, keymap, platform } from 'nsh';
import { NavStack, NavPage } from 'nsh/base';
import { Button } from '@hongguo/ui';
import { createStore, nav, type Route } from './store';
import { Search } from './pages/Search';
import { Detail } from './pages/Detail';
import { Player } from './pages/Player';
import { History } from './pages/History';
import { Account } from './pages/Account';

export function App() {
  const store = createStore();
  const back = () => {
    if (nav.routes().length > 1) nav.pop();
  };
  keymap.bind('escape', back, { when: 'notEditing' });
  const title = (route: Route) =>
    ({ search: '找剧', detail: '详情', player: '观看', history: '继续观看', account: '账号' })[
      route.name
    ];
  const header = (route: Route) => (
    <View class="flex-row flex-wrap items-center gap-3 border-b border-border px-5 py-3 bg-background">
      <If when={route.name !== 'search'}>
        <Button label="返回" onPress={back} />
      </If>
      <Text class="text-xl font-semibold text-foreground flex-1">红果</Text>
      <If when={route.name === 'search'}>
        <Button
          label="继续观看"
          onPress={() => {
            store.library.refetch();
            nav.push({ name: 'history' });
          }}
        />
        <Button
          label={store.account()?.profile?.name || '账号'}
          onPress={() => {
            store.account.refetch();
            nav.push({ name: 'account' });
          }}
        />
      </If>
    </View>
  );
  return (
    <View class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <NavStack state={nav} class="flex-1">
        {(route) => (
          <NavPage
            title={title(route)}
            header={header(route)}
            headerVisible={platform.os !== 'android'}
          >
            <If when={platform.os === 'android'}>{header(route)}</If>
            <If when={route.name === 'search'}>
              <Search store={store} />
            </If>
            <If when={route.name === 'detail'}>
              {() => (
                <Detail drama={(route as Extract<Route, { name: 'detail' }>).drama} store={store} />
              )}
            </If>
            <If when={route.name === 'player'}>
              {() => (
                <Player
                  drama={(route as Extract<Route, { name: 'player' }>).drama}
                  episode={(route as Extract<Route, { name: 'player' }>).episode}
                  store={store}
                />
              )}
            </If>
            <If when={route.name === 'history'}>
              <History store={store} />
            </If>
            <If when={route.name === 'account'}>
              <Account store={store} />
            </If>
          </NavPage>
        )}
      </NavStack>
    </View>
  );
}
