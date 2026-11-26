import { View, signal, type ViewRef } from 'nsh';
import { Button, UiText } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import { PosterCollection } from '../src/PosterCollection';

/** Production collection with synthetic rows; only the fixture owns navigation and mutations. */
export function PosterCollectionStateFixture() {
  const rows = signal<Drama[]>(
    Array.from({ length: 48 }, (_, index) => ({
      series_id: String(5000 + index),
      title: `合成作品${5000 + index}`,
      cover: '',
      intro: '',
    })),
  );
  const layout = signal<'grid' | 'shelf'>('shelf');
  const collection = signal('first');
  const width = signal(900);
  const opened = signal('');
  const primaryPresses = signal(0);
  let primary: ViewRef | undefined;
  let restore: (() => void) | undefined;
  let epoch = 0;
  const navigate = () => {
    epoch++;
  };
  const back = () => {
    opened.set('');
    requestAnimationFrame(() => restore?.());
  };
  return (
    <View class="flex-1 bg-background p-6 gap-4">
      <UiText>{`opened:${opened() || 'none'} · primary:${primaryPresses()}`}</UiText>
      <View class="flex-row flex-wrap gap-2">
        <Button
          label="集合入口"
          testID="collection-primary"
          buttonRef={(ref) => {
            primary = ref;
          }}
          onPress={() => primaryPresses.set(primaryPresses() + 1)}
        />
        <Button label="网格" onPress={() => layout.set('grid')} />
        <Button label="横向列表" onPress={() => layout.set('shelf')} />
        <Button label="切换集合" onPress={() => collection.set('second')} />
        <Button label="缩窄区域" onPress={() => width.set(500)} />
        <Button label="重排" onPress={() => rows.set([...rows()].reverse())} />
        <Button
          label="删除当前作品"
          onPress={() => rows.set(rows().filter((row) => row.series_id !== opened()))}
        />
        <Button label="清空作品" onPress={() => rows.set([])} />
        <Button
          label="追加一页"
          onPress={() =>
            rows.update((all) => [
              ...all,
              ...Array.from({ length: 24 }, (_, index) => ({
                series_id: String(6000 + index),
                title: `合成作品${6000 + index}`,
                cover: '',
                intro: '',
              })),
            ])
          }
        />
      </View>
      <View
        class={opened() ? 'hidden' : 'flex-1 min-h-0'}
        disabled={!!opened()}
        style={{ width: width() }}
      >
        <PosterCollection
          target="tv"
          layout={layout()}
          active={!opened()}
          items={rows()}
          collection={`fixture:drama:${collection()}`}
          testID="collection-list"
          label="合成作品"
          selected=""
          caption={() => undefined}
          onNavigate={navigate}
          focusGuard={() => {
            const owned = epoch;
            return () => owned === epoch;
          }}
          onEmptyFocus={() => primary?.focus()}
          onOpen={(drama, source) => {
            restore = source;
            opened.set(drama.series_id);
          }}
        />
      </View>
      <If when={opened()}>
        <Button label="返回集合" onPress={back} />
        <Button
          label="返回但选择入口"
          onPress={() => {
            opened.set('');
            restore?.();
            navigate();
            primary?.focus();
          }}
        />
      </If>
    </View>
  );
}
