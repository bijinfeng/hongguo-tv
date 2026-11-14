import { signal, Text, View, type ViewRef } from 'nsh';
import { Button, CardControls, PosterCard } from '@hongguo/ui';

/** Exercises the shared card group's public focus and disposal contract. */
export function CardControlsStateFixture() {
  const shown = signal(true);
  const ids = signal(['1', '2', '3']);
  const events = signal<string[]>([]);
  const refs = new Map<string, ViewRef>();
  let after: ViewRef | undefined;
  const record = (value: string) => events.update((all) => [...all, value]);
  return (
    <View class="flex-1 bg-background gap-3 p-4">
      <Button label="前一个控件" onPress={() => record('before')} />
      <If when={shown()}>
        <CardControls label="测试卡片">
          <Each of={ids()} key={(id) => id}>
            {(id) => (
              <PosterCard
                buttonRef={(ref) => refs.set(id(), ref)}
                testID={`card-${id()}`}
                title={`卡片${id()}`}
                onPress={() => record(id())}
              />
            )}
          </Each>
        </CardControls>
      </If>
      <Button
        buttonRef={(ref) => (after = ref)}
        label="后一个控件"
        onPress={() => record('after')}
      />
      <Button label="聚焦第二张" onPress={() => refs.get('2')?.focus()} />
      <Button label="移除第二张" onPress={() => ids.set(['1', '3'])} />
      <Button label="聚焦第三张" onPress={() => refs.get('3')?.focus()} />
      <Button
        label="移除卡片组"
        onPress={() => {
          shown.set(false);
          after?.focus();
        }}
      />
      <Text>{`events:${events().join(',')}`}</Text>
    </View>
  );
}
