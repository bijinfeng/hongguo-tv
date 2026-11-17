import { Text, View, signal, effect, cleanup, keymap, type ViewRef } from 'nsh';
import { Slider as BaseSlider } from 'nsh/base';
import { Product, tvUnit, controlMetrics } from './foundation';

/** A controlled numeric preview with a separate completion event. */
export interface SliderProps {
  /** Name of the quantity being adjusted. */
  label: string;
  /** The caller's current preview. */
  value: number;
  /** Inclusive minimum, default zero. */
  min?: number;
  /** Inclusive maximum. */
  max: number;
  /** Value step, default one. */
  step?: number;
  /** Blocks preview and commit. */
  disabled?: boolean;
  /** Preview changes, including cancellation back to the entry value. */
  onChange: (event: { value: number }) => void;
  /** Final value when pointer/key adjustment completes, or TV confirms. */
  onChangeEnd?: (event: { value: number }) => void;
  /** TV returned while adjusting; value is restored before this callback. */
  onCancel?: () => void;
  /** Stable automation identifier. */
  testID?: string;
}

/** Shared slider; TV confirms adjustment before preview and returns to roll it back. */
export function Slider(props: SliderProps) {
  const target = Product();
  const editing = signal(false);
  const focused = signal(false);
  let entryValue = 0;
  let adjustment: ViewRef | undefined;
  const bounded = (value: number) =>
    Math.max(props.min ?? 0, Math.min(Math.max(props.min ?? 0, props.max), value));
  const preview = (direction: number) => {
    const step = props.step && props.step > 0 ? props.step : (props.max - (props.min ?? 0)) / 100;
    const value = bounded(Number((props.value + direction * step).toPrecision(12)));
    props.onChange({ value });
    return value;
  };
  const cancel = () => {
    editing.set(false);
    props.onChange({ value: entryValue });
    props.onCancel?.();
  };
  const activate = () => {
    if (props.disabled) return;
    if (editing()) {
      editing.set(false);
      props.onChangeEnd?.({ value: props.value });
    } else {
      adjustment?.focus();
      entryValue = props.value;
      editing.set(true);
    }
  };
  effect(() => {
    if (props.disabled && editing()) cancel();
  });
  // NSH 0.5 exposes only the slider shell ref, not its thumb: TV owns one stable adjustment stop.
  effect(() => {
    if (target !== 'tv' || !focused() || props.disabled) return;
    const enter = keymap.bind('enter', activate);
    const adjust = editing()
      ? keymap.bind(
          {
            left: () => preview(-1),
            right: () => preview(1),
            escape: cancel,
          },
          { repeat: true },
        )
      : undefined;
    cleanup(() => {
      enter();
      adjust?.();
    });
  });
  return (
    <View
      ref={(ref) => (adjustment = ref)}
      testID={target === 'tv' && props.testID ? `${props.testID}-adjust` : undefined}
      role={target === 'tv' ? 'adjustable' : undefined}
      accessibilityLabel={target === 'tv' ? props.label : undefined}
      accessibilityHint={
        target === 'tv' ? (editing() ? '左右调整；确认应用，返回取消' : '确认后调整') : undefined
      }
      accessibilityValue={
        target === 'tv' ? { min: props.min ?? 0, max: props.max, now: props.value } : undefined
      }
      accessibilityActions={
        target === 'tv'
          ? [
              { name: 'increment', label: '增大' },
              { name: 'decrement', label: '减小' },
            ]
          : undefined
      }
      onAccessibilityAction={({ actionName }) => {
        if (target !== 'tv' || props.disabled || !['increment', 'decrement'].includes(actionName))
          return;
        const value = preview(actionName === 'increment' ? 1 : -1);
        if (!editing()) props.onChangeEnd?.({ value });
      }}
      disabled={props.disabled}
      focusable={target === 'tv' && !props.disabled}
      onPress={target === 'tv' ? activate : undefined}
      onFocus={() => focused.set(true)}
      onBlur={() => {
        focused.set(false);
        if (editing()) cancel();
      }}
      class="min-w-0 gap-2 rounded-(--radius) focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
    >
      <If when={target === 'tv'}>
        <Text class="text-foreground" style={{ fontSize: controlMetrics().fontSize }}>
          {props.label}：{props.value}
        </Text>
      </If>
      <View accessibilityElementsHidden={target === 'tv'}>
        <BaseSlider
          testID={props.testID}
          accessibilityLabel={props.label}
          value={props.value}
          min={props.min ?? 0}
          max={props.max}
          step={props.step ?? 1}
          disabled={props.disabled || target === 'tv'}
          onChange={({ value }) => {
            if (typeof value === 'number') props.onChange({ value });
          }}
          onChangeEnd={({ value }) => {
            if (target !== 'tv' && typeof value === 'number') props.onChangeEnd?.({ value });
          }}
          class="min-w-0"
          trackClass="justify-center"
          trackStyle={{ minHeight: controlMetrics().height }}
          indicatorClass="rounded-full bg-border"
          indicatorStyle={{ height: Product() === 'tv' ? tvUnit(6) : 4 }}
          rangeClass="rounded-full bg-primary"
          thumbClass={`rounded-full border border-input bg-card hover:bg-accent active:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${props.disabled ? 'bg-muted' : target === 'desktop' ? 'disabled:bg-muted' : ''}`}
          thumbStyle={{
            width: Product() === 'tv' ? tvUnit(24) : 16,
            height: Product() === 'tv' ? tvUnit(24) : 16,
          }}
        />
      </View>
    </View>
  );
}
