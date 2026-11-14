import { Scroll, View, batch, signal, type ViewRef } from 'nsh';
import { Button } from '../src/button';
import { CardControls } from '../src/card-controls';
import { UiText } from '../src/display';
import { Product, type ProductTarget } from '../src/foundation';
import { SeasonChoice } from '../src/season-choice';

/** Synthetic presentation facts only; no catalog, media or history ownership. */
export function SeasonChoices(props: { target: ProductTarget }) {
  const selected = signal('one');
  const requested = signal('none');
  const presses = signal(0);
  const focused = signal('none');
  const accepted = signal(true);
  const multiline = signal(false);
  const measured = signal('none');
  const refs = new Map<string, ViewRef>();
  const choose = (id: string) => {
    batch(() => {
      requested.set(id);
      presses.set(presses() + 1);
      if (accepted()) selected.set(id);
    });
  };
  const measure = async () => {
    const first = await refs.get('one')?.measure();
    const long = await refs.get('three')?.measure();
    measured.set(
      first && long && long.bounds.size.height > first.bounds.size.height ? 'grows' : 'flat',
    );
  };
  return (
    <Product.Provider value={props.target}>
      <View class="flex-1 bg-background p-8 gap-4">
        <View class="flex-row flex-wrap gap-3">
          <Button testID="choice-reject" label="拒绝选择" onPress={() => accepted.set(false)} />
          <Button testID="choice-accept" label="接受选择" onPress={() => accepted.set(true)} />
          <Button testID="choice-external" label="外部选择" onPress={() => selected.set('two')} />
          <Button
            testID="choice-reset"
            label="重置并聚焦"
            onPress={() => {
              batch(() => {
                selected.set('one');
                requested.set('none');
                presses.set(0);
                accepted.set(true);
              });
              refs.get('one')?.focus();
            }}
          />
          <Button testID="choice-multiline" label="多行状态" onPress={() => multiline.set(true)} />
          <Button
            testID="choice-measure"
            label="测量内容"
            onPress={() => {
              void measure();
            }}
          />
        </View>
        <UiText>{`choice:selected:${selected()} · requested:${requested()} · presses:${presses()}`}</UiText>
        <UiText>{`choice:focused:${focused()}`}</UiText>
        <UiText>{`choice:geometry:${measured()}`}</UiText>
        <Scroll class="flex-1" testID="choice-preview-scroll">
          <View class="p-2">
            <CardControls label="系列选择示例" class="flex-wrap items-start">
              <Each of={['one', 'two', 'three']}>
                {(id) => (
                  <SeasonChoice
                    title={
                      id() === 'one'
                        ? '春山不负第一季'
                        : id() === 'two'
                          ? '春山不负第二季'
                          : '春山不负第三季'
                    }
                    status={
                      id() === 'one'
                        ? '可续播'
                        : id() === 'two'
                          ? '播放中'
                          : multiline()
                            ? '待上线\n此为合成长状态\n用于验证自然高度'
                            : '待上线'
                    }
                    selected={selected() === id()}
                    onPress={() => choose(id())}
                    buttonRef={(ref) => refs.set(id(), ref)}
                    onFocus={() => focused.set(id())}
                    testID={`choice-${id()}`}
                  />
                )}
              </Each>
            </CardControls>
          </View>
        </Scroll>
      </View>
    </Product.Provider>
  );
}
