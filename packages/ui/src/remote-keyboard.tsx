import { View } from 'nsh';
import { Button } from './button';
import { CardControls } from './card-controls';
import { space } from './foundation';

const keys = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'];

export interface RemoteKeyboardProps {
  value: string;
  onInput: (value: string) => void;
  onSubmit?: () => void;
  columns?: 5 | 6;
  onClear: () => void;
  onBackspace: () => void;
  disabled?: boolean;
  testID?: string;
}

/** Controlled TV keyboard. It edits the caller's query and never owns search state. */
export function RemoteKeyboard(props: RemoteKeyboardProps) {
  const press = (key: string) => {
    if (!props.disabled) props.onInput(`${props.value}${key}`);
  };
  return (
    <View testID={props.testID} class="flex-col" style={{ gap: space('xs') }}>
      <Each of={Array.from({ length: Math.ceil(keys.length / (props.columns ?? 6)) }, (_, i) => i)}>
        {(row) => (
          <CardControls label={`遥控键盘第 ${row() + 1} 行`} gap={space('xxs')}>
            <Each of={Array.from({ length: props.columns ?? 6 }, (_, i) => i)}>
              {(slot) => (
                <View class="flex-1 min-w-0">
                  <If when={keys[row() * (props.columns ?? 6) + slot()]}>
                    {(key) => (
                      <Button
                        testID={props.testID ? `${props.testID}-${key()}` : undefined}
                        label={key()}
                        size="md"
                        class="w-full"
                        variant="quiet"
                        disabled={props.disabled}
                        onPress={() => press(key())}
                      />
                    )}
                  </If>
                </View>
              )}
            </Each>
          </CardControls>
        )}
      </Each>
      <CardControls label="遥控键盘操作" gap={space('xs')}>
        <Button
          testID={props.testID ? `${props.testID}-backspace` : undefined}
          label="删除一个字符"
          displayLabel="退格"
          size="sm"
          variant="quiet"
          disabled={props.disabled || !props.value}
          onPress={props.onBackspace}
        />
        <Button
          testID={props.testID ? `${props.testID}-clear` : undefined}
          label="清空输入"
          displayLabel="清空"
          size="sm"
          variant="quiet"
          disabled={props.disabled || !props.value}
          onPress={props.onClear}
        />
        <If when={props.onSubmit}>
          <Button
            testID={props.testID ? `${props.testID}-submit` : undefined}
            label="提交搜索"
            size="sm"
            variant="primary"
            disabled={props.disabled || !props.value.trim()}
            onPress={() => props.onSubmit?.()}
          />
        </If>
      </CardControls>
    </View>
  );
}
