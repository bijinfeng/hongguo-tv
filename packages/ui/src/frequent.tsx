import { Text, View, cleanup, effect, signal, token, type ViewRef } from 'nsh';
import { Button } from './button';
import { controlMetrics, radius, space } from './foundation';
import { UiText } from './display';
import { textLineHeight, textSize, textWeight } from './typography';

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
    fontSize: textSize('body'),
    lineHeight: textLineHeight('body'),
    fontWeight: textWeight('body'),
    color: token('foreground'),
  });
  const toggle = () => {
    const next = !isExpanded();
    if (props.expanded === undefined) expanded.set(next);
    props.onExpandedChange?.({ expanded: next });
  };
  return (
    <View testID={props.testID} class="relative items-start" style={{ gap: space('xs') }}>
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
          class="self-stretch"
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
    <View testID={props.testID} style={{ gap: space('md') }}>
      <View
        ref={(ref) => (groupRef = ref)}
        role="group"
        accessibilityLabel={props.label}
        focusable={!props.values.length && !props.emptyAction}
        style={{ gap: space('sm'), minHeight: controlMetrics().height, borderRadius: radius('xl') }}
        class="flex-row flex-wrap items-center focus-visible:outline-2 focus-visible:outline-ring"
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
      <View class="flex-row flex-wrap items-center" style={{ gap: space('md') }}>
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
