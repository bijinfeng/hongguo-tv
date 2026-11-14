import { Scroll, Text, View, type ViewRef } from 'nsh';
import { Button, ContinueCard, StoryFeature, tvUnit } from '@hongguo/ui';
import type { Library } from '@hongguo/core-client';
import type { Store } from '../store';
import { historyLabel, LibraryStatus } from './History';
import { playbackTime } from '../format';
function Continuation(props: { entry: Library['entries'][number]; store: Store }) {
  let source: ViewRef | undefined;
  const entry = () => props.entry;
  return (
    <ContinueCard
      title={entry().drama.title}
      image={entry().drama.cover_fallback || entry().drama.cover}
      subtitle={`第 ${entry().episode ?? 1} 集 · ${entry().completed ? '本集已看完' : `看到 ${playbackTime(entry().position)}`}`}
      position={entry().position ?? 0}
      duration={entry().duration}
      label="选集与详情"
      accessibilityLabel={historyLabel(entry())}
      buttonRef={(ref) => {
        source = ref;
      }}
      onPress={() => props.store.open(entry().drama, () => source?.focus())}
    />
  );
}

export function Home(props: { store: Store }) {
  let resumeRef: ViewRef | undefined;
  const current = () => props.store.entries()[0];
  return (
    <Scroll
      testID="home-scroll"
      class="flex-1"
      contentStyle={{
        paddingHorizontal: props.store.target === 'tv' ? 0 : 40,
        paddingVertical: props.store.target === 'tv' ? tvUnit(32) : 40,
        gap: 28,
      }}
    >
      <View class="gap-7">
        <If when={props.store.target === 'desktop'}>
          <Text
            role="header"
            accessibilityLevel={1}
            class="text-[32px] font-semibold text-foreground"
          >
            首页
          </Text>
        </If>
        <LibraryStatus store={props.store} />
        <If when={props.store.entries().length}>
          <If
            when={props.store.target === 'tv'}
            else={
              <View class="gap-6">
                <View class="flex-row items-center justify-between">
                  <Text
                    role="header"
                    accessibilityLevel={2}
                    class="text-xl font-semibold text-foreground"
                  >
                    继续观看
                  </Text>
                  <Button
                    label="全部记录"
                    icon="forward"
                    variant="quiet"
                    compact
                    onPress={() => {
                      props.store.navigate('history');
                      props.store.restoreFocus();
                    }}
                  />
                </View>
                <View class="flex-row gap-6">
                  <Each
                    of={props.store.entries().slice(0, 2)}
                    key={(entry) => entry.drama.series_id}
                  >
                    {(entry) => (
                      <View class="flex-1">
                        <Continuation entry={entry()} store={props.store} />
                      </View>
                    )}
                  </Each>
                  <If when={props.store.entries().length === 1}>
                    <View class="flex-1" />
                  </If>
                </View>
              </View>
            }
          >
            {() => (
              <StoryFeature
                title={current()?.drama.title || ''}
                image={current()?.drama.cover_fallback || current()?.drama.cover}
                meta={`${current()?.drama.episode_count ?? 0} 集`}
                description={current()?.drama.intro}
                footer={`第 ${current()?.episode ?? 1} 集 · ${current()?.completed ? '本集已看完' : `看到 ${playbackTime(current()?.position)}`}`}
              >
                <Button
                  primary
                  icon="forward"
                  label="选集与详情"
                  buttonRef={(ref) => {
                    resumeRef = ref;
                  }}
                  onPress={() => {
                    const entry = current();
                    if (entry) props.store.open(entry.drama, () => resumeRef?.focus());
                  }}
                />
              </StoryFeature>
            )}
          </If>
        </If>
        <View class="items-start">
          <Button
            label={props.store.target === 'tv' ? '刷剧' : '刷一部短剧'}
            icon="play"
            testID="home-feed"
            onPress={() => {
              props.store.navigate('feed');
              props.store.restoreFocus();
            }}
          />
        </View>
      </View>
    </Scroll>
  );
}
