import { Text, View, type JSX, type InputRef, type ViewRef } from 'nsh';
import { Button as BaseButton, Input as BaseInput, Toolbar } from 'nsh/base';
import { entrance } from './motion';

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  testID?: string;
}) {
  return (
    <BaseButton
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      selected={props.selected}
      class={`min-h-12 android:min-h-16 justify-center items-center rounded-(--radius) border-2 px-4 py-3 transition-colors active:opacity-70 focus-visible:border-ring disabled:opacity-40 ${props.primary ? 'bg-primary border-primary hover:bg-primary/90' : 'bg-card border-border hover:bg-accent'} selected:bg-accent selected:border-primary`}
    >
      <Text
        class={
          props.primary
            ? 'text-base android:text-xl font-semibold text-primary-foreground'
            : 'text-base android:text-xl text-foreground'
        }
      >
        {props.label}
      </Text>
    </BaseButton>
  );
}
export function SearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: (ref: InputRef) => void;
}) {
  return (
    <BaseInput
      testID="search-input"
      ref={props.inputRef}
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      onSubmit={props.onSubmit}
      placeholder="搜索短剧"
      accessibilityLabel="搜索短剧"
      class="flex-1 min-h-12 rounded-(--radius) border border-input bg-card px-4 py-3 text-base text-foreground focus:border-ring"
    />
  );
}
export function Surface(props: { children?: JSX.Element; class?: string }) {
  const motion = entrance();
  return (
    <View
      style={motion.style}
      class={`gap-4 rounded-(--radius) border border-border bg-card p-5 ${props.class ?? ''}`}
    >
      {props.children}
    </View>
  );
}
export function Notice(props: { message: string; error?: boolean; retry?: () => void }) {
  return (
    <Surface>
      <Text class={props.error ? 'text-base text-destructive' : 'text-base text-muted-foreground'}>
        {props.message}
      </Text>
      <If when={props.retry}>
        <Button label="重试" onPress={() => props.retry?.()} />
      </If>
    </Surface>
  );
}

export function Controls(props: { label: string; children?: JSX.Element }) {
  return (
    <Toolbar accessibilityLabel={props.label} class="flex-row flex-wrap gap-3">
      {props.children}
    </Toolbar>
  );
}

export function ResultCard(props: {
  children?: JSX.Element;
  onPress: () => void;
  selected: boolean;
  testID: string;
  buttonRef: (ref: ViewRef) => void;
}) {
  return (
    <BaseButton
      ref={props.buttonRef}
      testID={props.testID}
      onPress={props.onPress}
      selected={props.selected}
      class="flex-row gap-5 rounded-(--radius) border-2 border-border bg-card p-4 hover:bg-muted focus-visible:border-ring selected:border-primary active:opacity-70"
    >
      {props.children}
    </BaseButton>
  );
}
