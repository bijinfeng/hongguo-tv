import { Text, View, cleanup, effect, signal, token, type JSX, type ViewRef } from 'nsh';
import { Button } from './button';
import { Product, controlMetrics, tvUnit } from './foundation';
import { UiText } from './display';

const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);

/** Text stays with the caller; an optional expanded value makes disclosure controlled. */
export interface ExpandableTextProps {
  text: string;
  collapsedLines?: number;
  expanded?: boolean;
  expandLabel?: string;
  collapseLabel?: string;
  onExpandedChange?: (event: { expanded: boolean }) => void;
  testID?: string;
}

/** Expands long copy in place; native line measurement leaves short copy without a trigger. */
export function ExpandableText(props: ExpandableTextProps) {
  const expanded = signal(false);
  const overflowing = signal(false);
  const isExpanded = () => props.expanded ?? expanded();
  const lines = () => Math.max(1, props.collapsedLines ?? 2);
  const font = () => ({
    fontSize: controlMetrics().fontSize,
    lineHeight: controlMetrics().fontSize * 1.8,
  });
  const toggle = () => {
    const next = !isExpanded();
    if (props.expanded === undefined) expanded.set(next);
    props.onExpandedChange?.({ expanded: next });
  };
  return (
    <View testID={props.testID} class="relative min-w-0 items-start gap-2">
      <Text
        accessibilityElementsHidden
        onTextLayout={({ lines: measured }) => overflowing.set(measured.length > lines())}
        style={{
          ...font(),
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
        class="text-foreground"
      >
        {props.text}
      </Text>
      <View selectable class="self-stretch">
        <Text
          style={{
            ...font(),
            numberOfLines: isExpanded() ? 0 : lines(),
            selectionColor: token('accent'),
          }}
          class="text-foreground self-stretch"
        >
          {props.text}
        </Text>
      </View>
      <If when={overflowing()}>
        <Button
          label={
            isExpanded() ? (props.collapseLabel ?? '收起简介') : (props.expandLabel ?? '展开简介')
          }
          expanded={isExpanded()}
          onPress={toggle}
          variant="quiet"
          testID={props.testID ? `${props.testID}-toggle` : undefined}
        />
      </If>
    </View>
  );
}

/** Stable identity is independent of labels and their order. */
export interface RemovableChip {
  id: string;
  label: string;
}

/** Values remain controlled; callbacks report removal intent and never mutate the array. */
export interface RemovableChipGroupProps {
  label: string;
  values: RemovableChip[];
  onRemove: (event: { id: string }) => void;
  onClear?: () => void;
  clearLabel?: string;
  emptyLabel?: string;
  emptyAction?: { label: string; onPress: () => void };
  testID?: string;
}

/** Removes conditions with next/previous/empty focus handoff, shared by keyboard and remote input. */
export function RemovableChipGroup(props: RemovableChipGroupProps) {
  const refs = new Map<string, ViewRef>();
  let emptyRef: ViewRef | undefined;
  let groupRef: ViewRef | undefined;
  let focusedIndex = 0;
  let clearing = false;
  let frame: number | undefined;
  let focusEpoch = 0;
  let disposed = false;
  cleanup(() => {
    disposed = true;
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  const handoff = (focus: () => void) => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    const epoch = focusEpoch;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed && epoch === focusEpoch) focus();
    });
  };
  const focusAfterRemoval = (id: string) => {
    const index = focusedIndex;
    handoff(() => {
      if (props.values.some((value) => value.id === id)) return;
      const values = props.values.filter((value) => value.id !== id);
      const next = values[Math.min(index, values.length - 1)];
      if (next) refs.get(next.id)?.focus();
      else (emptyRef ?? groupRef)?.focus();
    });
  };
  effect(() => {
    const values = props.values;
    for (const id of refs.keys()) if (!values.some((value) => value.id === id)) refs.delete(id);
    if (clearing && !values.length) {
      clearing = false;
      handoff(() => (emptyRef ?? groupRef)?.focus());
    }
  });
  return (
    <View testID={props.testID} style={{ gap: unit(16) }}>
      <View
        ref={(ref) => (groupRef = ref)}
        role="group"
        accessibilityLabel={props.label}
        focusable={!props.values.length && !props.emptyAction}
        style={{ gap: unit(12), minHeight: controlMetrics().height }}
        class="flex-row flex-wrap items-center rounded-(--radius) focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Each of={props.values} key={(value) => value.id}>
          {(value) => (
            <Button
              label={`移除条件：${value().label}`}
              displayLabel={value().label}
              icon="x"
              onPress={() => {
                const id = value().id;
                focusedIndex = props.values.findIndex((entry) => entry.id === id);
                props.onRemove({ id });
                focusAfterRemoval(id);
              }}
              onFocus={() => {
                focusEpoch += 1;
                focusedIndex = props.values.findIndex((entry) => entry.id === value().id);
              }}
              onBlur={() => {
                if (props.values.some((entry) => entry.id === value().id)) focusEpoch += 1;
              }}
              onFocusedRemoval={() => focusAfterRemoval(value().id)}
              buttonRef={(ref) => refs.set(value().id, ref)}
              testID={props.testID ? `${props.testID}-${value().id}` : undefined}
            />
          )}
        </Each>
        <If when={!props.values.length}>
          <UiText>{props.emptyLabel ?? '未设置筛选条件'}</UiText>
        </If>
      </View>
      <View class="flex-row flex-wrap items-center" style={{ gap: unit(16) }}>
        <If when={props.onClear}>
          <Button
            label={props.clearLabel ?? '清空条件'}
            variant="quiet"
            disabled={!props.values.length}
            onBlur={() => {
              clearing = false;
            }}
            onPress={() => {
              clearing = true;
              props.onClear?.();
            }}
          />
        </If>
        <If when={props.emptyAction}>
          <Button
            label={props.emptyAction!.label}
            variant="quiet"
            buttonRef={(ref) => (emptyRef = ref)}
            onFocus={() => {
              focusEpoch += 1;
            }}
            onPress={() => props.emptyAction?.onPress()}
            testID={props.testID ? `${props.testID}-empty-action` : undefined}
          />
        </If>
      </View>
    </View>
  );
}

/** A settings row owns geometry and copy; its caller supplies the control and confirmed value. */
export interface SettingsRowProps {
  label: string;
  description?: string;
  value?: string;
  error?: string;
  children?: JSX.Element;
  testID?: string;
}

/** Aligns labels and controls on a stable row, with failure next to the affected setting. */
export function SettingsRow(props: SettingsRowProps) {
  return (
    <View
      testID={props.testID}
      style={{ gap: unit(12), paddingVertical: unit(16) }}
      class="border-b border-border"
    >
      <View
        style={{ minHeight: controlMetrics().height, gap: unit(24) }}
        class="flex-row flex-wrap items-center justify-between"
      >
        <View class="flex-1 min-w-0 gap-1">
          <UiText>{props.label}</UiText>
          <If when={props.description}>
            <UiText role="meta">{props.description}</UiText>
          </If>
        </View>
        <If when={props.value}>
          <UiText tone="muted">{props.value}</UiText>
        </If>
        {props.children}
      </View>
      <If when={props.error}>
        <Text role="alert" style={{ fontSize: controlMetrics().fontSize }} class="text-destructive">
          {props.error}
        </Text>
      </If>
    </View>
  );
}
