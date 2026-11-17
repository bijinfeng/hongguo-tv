import { Scroll } from 'nsh';
import { UiText } from '@hongguo/ui';
import type { Store } from '../store';
import { ContentColumn } from '../shell/ContentColumn';
import { HomeHero } from './home/HomeHero';
import { ContinueSection } from './home/ContinueSection';
import { CatalogSection } from './home/CatalogSection';

/** Home: draft greeting, hero, continue rail and the catalog grid inside the shared column. */
export function Home(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  return (
    <Scroll testID="home-scroll" class="flex-1 min-h-0" contentStyle={{ flexDirection: 'column' }}>
      <ContentColumn store={props.store}>
        <If when={!tv()}>
          <UiText role="section">把今晚，留给好故事。</UiText>
        </If>
        <HomeHero store={props.store} />
        <ContinueSection store={props.store} />
        <CatalogSection store={props.store} />
      </ContentColumn>
    </Scroll>
  );
}
