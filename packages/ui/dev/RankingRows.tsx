import { Scroll, View, batch, signal, type ViewRef } from 'nsh';
import { Button } from '../src/button';
import { CardControls } from '../src/card-controls';
import { UiText } from '../src/display';
import { type ProductTarget } from '../src/foundation';
import { RankingCard } from '../src/ranking-card';

const rows = [
  { key: 'drama:42', title: '春日来信', kind: 'drama', rank: 1, action: '查看短剧' },
  { key: 'actor:42', title: '林悦', kind: 'actor', rank: 17, action: '查看演员' },
  {
    key: 'drama:missing',
    title: '重逢以后，那封跨越漫长岁月的来信终于送到了你的手中',
    kind: 'drama',
    rank: undefined,
    action: '查看短剧',
  },
  { key: 'actor:zero', title: '零名次示例', kind: 'actor', rank: 0, action: '查看演员' },
  { key: 'drama:negative', title: '负数名次示例', kind: 'drama', rank: -1, action: '查看短剧' },
  { key: 'actor:fraction', title: '小数名次示例', kind: 'actor', rank: 1.5, action: '查看演员' },
  { key: 'drama:nan', title: '非数名次示例', kind: 'drama', rank: NaN, action: '查看短剧' },
  {
    key: 'actor:infinity',
    title: '无限名次示例',
    kind: 'actor',
    rank: Infinity,
    action: '查看演员',
  },
] as const;

/** Caller-owned row contract, isolated from ranking services and navigation. */
export function RankingRows(props: { target: ProductTarget }) {
  const target = signal(props.target);
  const selected = signal('drama:42');
  const requested = signal('none');
  const focused = signal('none');
  const accepted = signal(true);
  const presses = signal(0);
  let first: ViewRef | undefined;
  const choose = (key: string) => {
    batch(() => {
      requested.set(key);
      presses.set(presses() + 1);
      if (accepted()) selected.set(key);
    });
  };
  return (
    <>
      <View class="flex-1 bg-background p-8 gap-4">
        <UiText role="section">榜单卡片基础组件验收</UiText>
        <View class="flex-row flex-wrap gap-3">
          <Button label="桌面" testID="ranking-desktop" onPress={() => target.set('desktop')} />
          <Button label="TV" testID="ranking-tv" onPress={() => target.set('tv')} />
          <Button label="暂停接受选择" testID="ranking-hold" onPress={() => accepted.set(false)} />
          <Button
            label="外部选择演员"
            testID="ranking-external"
            onPress={() => selected.set('actor:42')}
          />
          <Button
            label="重置并聚焦首行"
            testID="ranking-reset"
            onPress={() => {
              batch(() => {
                selected.set('drama:42');
                requested.set('none');
                presses.set(0);
                accepted.set(true);
              });
              first?.focus();
            }}
          />
        </View>
        <UiText role="meta">{`target:${target()} · selected:${selected()}`}</UiText>
        <UiText role="meta">{`requested:${requested()} · presses:${presses()}`}</UiText>
        <UiText role="meta">{`focused:${focused()}`}</UiText>
        <Scroll testID="ranking-scroll" class="flex-1">
          <View class="p-2">
            <CardControls label="榜单示例" vertical>
              <Each of={rows}>
                {(row) => (
                  <RankingCard
                    title={row().title}
                    kind={row().kind}
                    rank={row().rank}
                    subtitle={row().kind === 'actor' ? '演员' : '短剧'}
                    metadata={row().key === 'drama:42' ? '都市' : undefined}
                    selected={selected() === row().key}
                    actionLabel={row().action}
                    testID={`ranking-row-${row().key}`}
                    buttonRef={(ref) => {
                      if (row().key === 'drama:42') first = ref;
                    }}
                    onFocus={() => focused.set(row().key)}
                    onPress={() => choose(row().key)}
                  />
                )}
              </Each>
            </CardControls>
          </View>
        </Scroll>
      </View>
    </>
  );
}
