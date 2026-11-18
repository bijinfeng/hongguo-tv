import { Scroll, View, signal, type ScrollRef, type ViewRef } from 'nsh';
import { Button, UiText, type ProductTarget } from '@hongguo/ui';
import type { Drama, SeriesDetail } from '@hongguo/core-client';
import { DetailExtras } from '../src/DetailExtras';
import type { Store } from '../src/store';

const actorFirst = '7007199254740992';
const actorSecond = '7007199254740993';
const dramaFirst = '9007199254740992';
const dramaSecond = '9007199254740993';
const related: Drama[] = Array.from({ length: 12 }, (_, index) => ({
  series_id: index === 0 ? dramaFirst : index === 1 ? dramaSecond : String(5000 + index),
  content_type: '1',
  title: `合成相关作品${index + 1}`,
  cover: '',
  intro: '',
  episode_count: 2,
}));
const detail: SeriesDetail = {
  series_id: '100',
  title: '合成详情',
  cover: '',
  intro: '',
  episodes: [],
  actors: [
    { actor_id: actorFirst, name: '合成演员甲', avatar: '' },
    { actor_id: actorSecond, name: '合成演员乙', avatar: '' },
    { name: '无编号演员', avatar: '' },
  ],
  related,
};
/** Exercises the production component with only its store ports installed.
 * The guard matches createStore's revision rule; routing, transport and native focus are tested separately by the host suite.
 */
export function DetailExtrasStateFixture(props: { target: ProductTarget }) {
  const active = signal(true);
  const mounted = signal(true);
  const count = signal(related.length);
  const collection = signal('one');
  const opened = signal('none');
  const opens = signal(0);
  const alternatePresses = signal(0);
  let intent = 0;
  let alternate: ViewRef | undefined;
  let scroll: ScrollRef | undefined;
  let origin: (() => void) | undefined;
  const ports: Pick<
    Store,
    'target' | 'noteFocusIntent' | 'focusGuard' | 'rememberSource' | 'open' | 'openActor'
  > = {
    target: props.target,
    noteFocusIntent() {
      intent++;
    },
    focusGuard() {
      const owned = intent;
      return () => owned === intent;
    },
    rememberSource() {},
    openActor(id, _title, restore) {
      opened.set(`actor:${id}`);
      opens.set(opens() + 1);
      origin = restore;
    },
    open(drama, restore) {
      opened.set(`related:${drama.series_id}`);
      opens.set(opens() + 1);
      origin = restore;
    },
  };
  return (
    <>
      <View class="flex-1 bg-background p-8 gap-4">
        <View class="flex-row flex-wrap gap-3">
          <Button
            testID="extras-state-top"
            label="回到顶部"
            onPress={() => scroll?.scrollTo({ y: 0, animated: false })}
          />
          <Each of={[9, 10, 11]}>
            {(size) => (
              <Button
                testID={`extras-state-count-${size()}`}
                label={`${size()} 条作品`}
                onPress={() => count.set(size())}
              />
            )}
          </Each>
          <Button
            testID="extras-state-restore"
            label="恢复来源"
            onPress={() => {
              alternate?.focus();
              origin?.();
            }}
          />
          <Button
            testID="extras-state-interrupt"
            label="恢复后产生新输入"
            onPress={() => {
              origin?.();
              ports.noteFocusIntent();
              alternate?.focus();
            }}
          />
          <Button
            testID="extras-state-switch"
            label="切换集合"
            onPress={() => {
              collection.set(collection() === 'one' ? 'two' : 'one');
              alternate?.focus();
            }}
          />
          <Button
            testID="extras-state-unmount"
            label="移除扩展"
            onPress={() => {
              mounted.set(false);
              alternate?.focus();
            }}
          />
          <Button
            testID="extras-state-active"
            label="切换活动许可"
            onPress={() => {
              active.set(!active());
              alternate?.focus();
            }}
          />
          <Button
            testID="extras-state-alternate"
            label="另一操作"
            buttonRef={(ref) => {
              alternate = ref;
            }}
            onPress={() => alternatePresses.set(alternatePresses() + 1)}
          />
        </View>
        <UiText>{`opened:${opened()} · opens:${opens()} · alternate:${alternatePresses()}`}</UiText>
        <UiText>{`active:${active()} · collection:${collection()} · mounted:${mounted()}`}</UiText>
        <Scroll
          testID="extras-state-scroll"
          ref={(ref) => {
            scroll = ref;
          }}
          class="flex-1 min-h-0"
          contentStyle={{ padding: 8 }}
        >
          <If when={mounted()}>
            <DetailExtras
              detail={{
                ...detail,
                related: related.slice(0, count()),
              }}
              collection={collection()}
              active={active()}
              store={ports as Store}
            />
          </If>
        </Scroll>
      </View>
    </>
  );
}
