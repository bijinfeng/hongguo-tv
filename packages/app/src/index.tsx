import { cleanup, View, keymap, reduceMotion, type ImageAsset } from 'nsh';
import { NavStack, NavPage } from 'nsh/base';
import { currentWindow, isAvailable } from 'nsh/desktop';
import { Button, Controls, Logo, Product, tvUnit, type ProductTarget } from '@hongguo/ui';
import { createStore, type Store, type FocusSource } from './store';
import { SearchForm } from './SearchForm';
import { Search } from './pages/Search';
import { Actor } from './pages/Actor';
import { Detail } from './pages/Detail';
import { Player } from './pages/Player';
import { History } from './pages/History';
import { Account } from './pages/Account';
import { Home } from './pages/Home';
import type { PlaybackCommandSource } from './playback';

function Navigation(props: { store: Store }) {
  return (
    <Controls
      label="主导航"
      vertical={props.store.target === 'desktop'}
      class={props.store.target === 'desktop' ? 'gap-1' : ''}
    >
      <Button
        testID="nav-home"
        buttonRef={(ref) => props.store.primaryRef('home', ref)}
        variant="navigation"
        icon={props.store.target === 'desktop' ? 'home' : undefined}
        label={props.store.target === 'tv' ? '精选' : '首页'}
        selected={props.store.activePage('home')}
        onPress={() => props.store.navigate('home')}
      />
      <Button
        testID="nav-search"
        buttonRef={(ref) => props.store.primaryRef('search', ref)}
        variant="navigation"
        icon={props.store.target === 'desktop' ? 'search' : undefined}
        label="找剧"
        selected={props.store.activePage('search')}
        onPress={() => props.store.navigate('search')}
      />
      <Button
        testID="nav-history"
        buttonRef={(ref) => props.store.primaryRef('history', ref)}
        variant="navigation"
        icon={props.store.target === 'desktop' ? 'history' : undefined}
        label={props.store.target === 'tv' ? '我的' : '继续观看'}
        selected={props.store.activePage('history')}
        onPress={() => props.store.navigate('history')}
      />
    </Controls>
  );
}
function Browse(props: { store: Store }) {
  // Keep page-local lists, anchors and refs alive; hidden sections have no input targets.
  return (
    <View class="flex-1">
      <View class={props.store.section() === 'home' ? 'flex-1' : 'hidden'}>
        <Home store={props.store} />
      </View>
      <View class={props.store.section() === 'search' ? 'flex-1' : 'hidden'}>
        <Search store={props.store} />
      </View>
      <View class={props.store.section() === 'history' ? 'flex-1' : 'hidden'}>
        <History store={props.store} />
      </View>
    </View>
  );
}
function Pages(props: { store: Store }) {
  return (
    <NavStack state={props.store.nav} class="flex-1" onChange={() => props.store.restoreFocus()}>
      {(route) => (
        <NavPage
          class="flex-1 bg-background"
          headerVisible={false}
          popOnBack={route.name !== 'player'}
          onBackPress={() => {
            if (route.name === 'player') props.store.back();
          }}
          animation={props.store.target === 'tv' || reduceMotion() ? 'none' : 'default'}
        >
          <View
            testID={`navigation-page-${props.store.nav.routes().indexOf(route)}`}
            class="flex-1 bg-background"
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
                  store={props.store}
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
            <If when={route.name === 'account'}>
              <Account store={props.store} />
            </If>
          </View>
        </NavPage>
      )}
    </NavStack>
  );
}
function DesktopShell(props: { store: Store; logoMark: ImageAsset }) {
  const window = isAvailable ? currentWindow() : undefined;
  const cinema = () =>
    props.store.nav.routes().at(-1)?.name === 'player' &&
    window?.state()?.placement.mode === 'fullScreen';
  return (
    <View class="flex-1 flex-row">
      <View
        class={
          cinema()
            ? 'hidden'
            : 'w-[204px] border-r border-border bg-background px-4 pt-6 pb-4 gap-8'
        }
      >
        <Logo mark={props.logoMark} class="px-3" />
        <View class="flex-1">
          <Navigation store={props.store} />
        </View>
        <Button
          variant="quiet"
          icon="user"
          label={props.store.account()?.profile?.name || '账号'}
          onPress={props.store.accountPage}
        />
      </View>
      <View class="flex-1">
        <View
          class={
            cinema()
              ? 'hidden'
              : 'h-[88px] flex-row items-center justify-between gap-4 border-b border-border px-10'
          }
        >
          <View class="w-[520px]">
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
        <Pages store={props.store} />
      </View>
    </View>
  );
}
function TvShell(props: { store: Store; logoMark: ImageAsset }) {
  const playing = () => props.store.nav.routes().at(-1)?.name === 'player';
  return (
    <View
      class="flex-1"
      style={{
        paddingHorizontal: playing() ? 0 : tvUnit(96),
        paddingBottom: playing() ? 0 : tvUnit(32),
      }}
    >
      <View
        class={playing() ? 'hidden' : 'flex-row items-center border-b border-border'}
        style={{ height: tvUnit(120), gap: tvUnit(56) }}
      >
        <Logo mark={props.logoMark} />
        <View class="flex-1">
          <Navigation store={props.store} />
        </View>
        <Button
          variant="quiet"
          label={props.store.account()?.profile?.name || '账号'}
          onPress={props.store.accountPage}
        />
      </View>
      <Pages store={props.store} />
    </View>
  );
}
export function App(props: {
  target: ProductTarget;
  logoMark: ImageAsset;
  subscribePlayerCommands?: PlaybackCommandSource;
  subscribeFocus?: FocusSource;
  onShutdown?: (drained: Promise<void>) => void;
  onReady?: () => void;
}) {
  const store = createStore(props.target, props.subscribePlayerCommands, props.subscribeFocus);
  cleanup(() => props.onShutdown?.(store.shutdown()));
  keymap.bind('escape', store.back, { when: 'notEditing' });
  keymap.bind(
    { tab: store.noteFocusIntent, 'shift+tab': store.noteFocusIntent },
    { when: 'always', passThrough: true },
  );
  props.onReady?.();
  return (
    <Product.Provider value={props.target}>
      <View
        testID={`app-${props.target}`}
        onTouchStartCapture={store.noteFocusIntent}
        class="flex-1 bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      >
        <If
          when={props.target === 'tv'}
          else={<DesktopShell store={store} logoMark={props.logoMark} />}
        >
          <TvShell store={store} logoMark={props.logoMark} />
        </If>
      </View>
    </Product.Provider>
  );
}

export { NativeApp } from './NativeApp';
