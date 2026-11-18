import { Text, View, signal, effect, cleanup, keymap, token, type ViewRef } from 'nsh';
import { Slider as BaseSlider } from 'nsh/base';
import { border, controlMetrics, space, weight, type ControlSize } from './foundation';

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
  /**
   * `direct` adjusts in place with pointer or keys. `confirm` moves focus to one stable
   * adjustment stop, previews with left/right, applies on confirm and rolls back on cancel.
   */
  activation?: 'direct' | 'confirm';
  /** Final value when adjustment completes, or when confirm applies the preview. */
  onChangeEnd?: (event: { value: number }) => void;
  /** Adjustment cancelled; the value is restored before this callback. */
  onCancel?: () => void;
  /** Control density; the track and thumb follow the label size. */
  size?: ControlSize;
  /** Stable automation identifier. */
  testID?: string;
}

/** Shared slider; confirm mode previews before applying and rolls back when cancelled. */
export function Slider(props: SliderProps) {
  const size = () => controlMetrics(props.size);
  // The rail is a tenth of the control height and the thumb a full label size,
  // so sm 3 / md 4 / lg 6 keeps its proportion across the three densities.
  const track = () => Math.round(size().height / 10);
  const confirm = () => props.activation === 'confirm';
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
  // NSH 0.5 exposes only the slider shell ref, not its thumb: confirm mode owns one stable stop.
  effect(() => {
    if (!confirm() || !focused() || props.disabled) return;
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
      testID={confirm() && props.testID ? `${props.testID}-adjust` : undefined}
      role={confirm() ? 'adjustable' : undefined}
      accessibilityLabel={confirm() ? props.label : undefined}
      accessibilityHint={
        confirm() ? (editing() ? '左右调整；确认应用，返回取消' : '确认后调整') : undefined
      }
      accessibilityValue={
        confirm() ? { min: props.min ?? 0, max: props.max, now: props.value } : undefined
      }
      accessibilityActions={
        confirm()
          ? [
              { name: 'increment', label: '增大' },
              { name: 'decrement', label: '减小' },
            ]
          : undefined
      }
      onAccessibilityAction={({ actionName }) => {
        if (!confirm() || props.disabled || !['increment', 'decrement'].includes(actionName))
          return;
        const value = preview(actionName === 'increment' ? 1 : -1);
        if (!editing()) props.onChangeEnd?.({ value });
      }}
      disabled={props.disabled}
      focusable={confirm() && !props.disabled}
      onPress={confirm() ? activate : undefined}
      onFocus={() => focused.set(true)}
      onBlur={() => {
        focused.set(false);
        if (editing()) cancel();
      }}
      class="focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
      style={{ gap: space('xs') }}
    >
      <If when={confirm()}>
        <Text
          style={{
            fontSize: size().fontSize,
            fontWeight: weight.regular(),
            color: token('foreground'),
          }}
        >
          {props.label}：{props.value}
        </Text>
      </If>
      <View accessibilityElementsHidden={confirm()}>
        <BaseSlider
          testID={props.testID}
          accessibilityLabel={props.label}
          value={props.value}
          min={props.min ?? 0}
          max={props.max}
          step={props.step ?? 1}
          disabled={props.disabled || confirm()}
          onChange={({ value }) => {
            if (typeof value === 'number') props.onChange({ value });
          }}
          onChangeEnd={({ value }) => {
            if (!confirm() && typeof value === 'number') props.onChangeEnd?.({ value });
          }}
          trackClass="justify-center"
          trackStyle={{ minHeight: size().height }}
          indicatorClass="rounded-full bg-border"
          indicatorStyle={{ height: track() }}
          rangeClass="rounded-full bg-primary"
          thumbClass={`rounded-full border border-input bg-card hover:bg-accent active:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${props.disabled ? 'bg-muted' : ''}`}
          thumbStyle={{
            width: size().fontSize,
            height: size().fontSize,
            borderWidth: border,
          }}
        />
      </View>
    </View>
  );
}
