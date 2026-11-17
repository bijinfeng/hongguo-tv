import { Text, signal, effect, type ViewProps, type ViewRef } from 'nsh';
import { Select as BaseSelect } from 'nsh/base';
import { Product, tvUnit, controlMetrics } from './foundation';
import { Button } from './button';
import { type ChoiceOption } from './choice';

/** Controlled selection from a bounded list. */
export interface SelectProps {
  /** Accessible name of the choice. */
  label: string;
  /** Current identifier, null when nothing is selected. */
  value: string | null;
  /** Options, in stable display order. */
  options: ChoiceOption[];
  /** Requested value after explicit choice. */
  onChange: (event: { value: string | null }) => void;
  /** Empty selection hint. */
  placeholder?: string;
  /** Prevents opening or changing. */
  disabled?: boolean;
  /** Stable identifier of the select. */
  testID?: string;
  /** Native root for focus restoration. */
  selectRef?: (ref: ViewRef) => void;
  /** Layout-only additions for composed rows; the trigger keeps control styling. */
  class?: string;
  /** Layout-only spacing override for the trigger, resolved after the control metrics. */
  style?: ViewProps['style'];
}

/** Styled NSH Select; NSH owns popup placement, choice, keyboard, dismissal and source restoration. */
export function Select(props: SelectProps) {
  const open = signal(false);
  effect(() => {
    if (props.disabled && open()) open.set(false);
  });
  return (
    <BaseSelect
      testID={props.testID}
      accessibilityLabel={props.label}
      items={props.options.map((option) => ({
        value: option.value,
        title: option.label,
        disabled: option.disabled,
      }))}
      value={props.value}
      disabled={props.disabled}
      open={open()}
      onOpenChange={(event) => {
        if (props.disabled && event.open) return;
        open.set(event.open);
      }}
      onChange={(event) => {
        if (!props.disabled) props.onChange(event);
      }}
      trigger={
        <Button
          label={props.label}
          displayLabel={
            props.options.find((option) => option.value === props.value)?.label ??
            (props.value !== null ? '当前选项不可用' : (props.placeholder ?? props.label))
          }
          icon="down"
          disabled={props.disabled}
          selectOpen={open()}
          class={props.class}
          style={props.style}
          buttonRef={props.selectRef}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          onPress={() => open.set(true)}
        />
      }
      popupClass="bg-popover border border-border rounded-(--radius) p-2"
      popupStyle={{ minWidth: Product() === 'tv' ? tvUnit(240) : 180 }}
      empty={
        <Text
          class="px-3 py-2 text-muted-foreground"
          style={{ fontSize: controlMetrics().fontSize }}
        >
          暂无可选项
        </Text>
      }
      itemClass="text-popover-foreground rounded-lg hover:bg-muted focus:bg-accent selected:bg-accent disabled:text-muted-foreground"
      itemStyle={{
        minHeight: controlMetrics().height,
        fontSize: controlMetrics().fontSize,
        paddingHorizontal: controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
      }}
    />
  );
}
