import { signal, cleanup, View, Text, type InputRef, type ViewRef } from 'nsh';
import { Button, SearchInput } from '@hongguo/ui';

/** Isolated public control contract; never imported by production entries. */
export function FocusedRemovalStateFixture() {
  const shown = signal(true);
  const disabled = signal(false);
  const text = signal('');
  const presses = signal(0);
  const handoffs = signal(0);
  const following = signal(0);
  let input: InputRef | undefined;
  let action: ViewRef | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  cleanup(() => clearTimeout(timer));
  return (
    <View class="p-10 gap-6 bg-background flex-1">
      <SearchInput
        value={text()}
        onChange={text.set}
        onSubmit={() => input?.blur()}
        inputRef={(ref) => {
          input = ref;
        }}
      />
      <If when={shown()}>
        <Button
          label="追加内容"
          testID="removable-action"
          disabled={disabled()}
          buttonRef={(ref) => {
            action = ref;
          }}
          onPress={() => {
            presses.update((n) => n + 1);
            action?.focus();
            timer = setTimeout(() => shown.set(false), 500);
          }}
          onFocusedRemoval={() => {
            handoffs.update((n) => n + 1);
            input?.focus();
          }}
        />
      </If>
      <Button label="后一个操作" onPress={() => following.update((n) => n + 1)} />
      <Button
        label="重新显示"
        onPress={() => {
          shown.set(true);
        }}
      />
      <Button label="切换禁用" onPress={() => disabled.update((value) => !value)} />
      <Text>presses:{presses()}</Text>
      <Text>handoffs:{handoffs()}</Text>
      <Text>following:{following()}</Text>
    </View>
  );
}
