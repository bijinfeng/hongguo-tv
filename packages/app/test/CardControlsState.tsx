import { signal, Text, View, keymap, type ViewRef } from 'nsh';
import { Button, CardControls, FilterChoices, PosterCard } from '@hongguo/ui';

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

/** Source groups must follow rendered order, identities and enabled state. */
export function SourceControlsStateFixture() {
  const disabled = signal(false);
  const event = signal('none');
  const choices = signal(['a', 'b', 'c']);
  const value = signal('');
  let last: ViewRef | undefined;
  let restore: (() => void) | undefined;
  const disable = () => {
    event.set('disabled');
    disabled.set(true);
  };
  keymap.bind('ctrl+d', disable);
  return (
    <View class="flex-1 bg-background p-4 gap-4">
      <CardControls label="来源命令">
        <Button testID="command-a" label="命令A" onPress={() => event.set('a')} />
        <Button label="禁用命令B" disabled onPress={() => event.set('b')} />
        <Button
          buttonRef={(ref) => {
            last = ref;
          }}
          label="命令C"
          disabled={disabled()}
          onPress={() => event.set('c')}
        />
      </CardControls>
      <Button label="聚焦命令C" onPress={() => last?.focus()} />
      <Button label="禁用当前命令" onPress={disable} />
      <FilterChoices
        label="题材"
        testID="source-topic"
        active
        value={value()}
        items={choices().map((id) => ({ value: id, title: `题材${id}` }))}
        onChange={(id) => {
          value.set(id);
          event.set(id);
        }}
        onSource={(source) => {
          restore = source;
        }}
      />
      <Button label="重排题材" onPress={() => choices.set(['c', 'a', 'b'])} />
      <Button label="收缩题材" onPress={() => choices.set(['b', 'a'])} />
      <Button label="恢复题材来源" onPress={() => restore?.()} />
      <Text>{`event:${event()}`}</Text>
    </View>
  );
}
