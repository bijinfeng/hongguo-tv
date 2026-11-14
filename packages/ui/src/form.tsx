import {
  Text,
  View,
  signal,
  effect,
  cleanup,
  keymap,
  reduceMotion,
  token,
  type JSX,
  type InputHostProps,
  type InputRef,
  type ViewRef,
} from 'nsh';
import {
  Input as BaseInput,
  Select as BaseSelect,
  Checkbox as BaseCheckbox,
  Switch as BaseSwitch,
  Radio,
  RadioGroup,
  Tabs as BaseTabs,
  Tab,
  Slider as BaseSlider,
} from 'nsh/base';
import { Product, tvUnit, controlMetrics } from './foundation';
import { Button } from './button';
import { Icon } from './icon';

/** A controlled text field. Input changes belong to the caller, including during composition. */
export interface TextInputProps {
  /** The field's accessible name; Field provides the visible label. */
  label: string;
  /** Current text, owned by the caller. */
  value: string;
  /** Reports the requested text before the caller updates value. */
  onChange: (event: { value: string }) => void;
  /** Explicit submission; never inferred from input length. */
  onSubmit?: () => void;
  /** Empty-text hint, not the field's accessible name. */
  placeholder?: string;
  /** Allows selection and copying without edits. */
  readonly?: boolean;
  /** Blocks interaction without erasing the current text. */
  disabled?: boolean;
  /** Indicates rejected content; describe the problem with description. */
  invalid?: boolean;
  /** Description or error read after the name. */
  description?: string;
  /** Appropriate native keyboard for this field. */
  keyboardType?: InputHostProps['keyboardType'];
  /** Native maximum character count, when the protocol defines one. */
  maxLength?: number;
  /** Autofill purpose, such as a one-time code. */
  autoComplete?: InputHostProps['autoComplete'];
  /** Composition lifecycle is forwarded without transforming the text. */
  onCompositionChange?: InputHostProps['onCompositionChange'];
  /** Stable automation identifier. */
  testID?: string;
  /** The actual native input, for focusing and selection. */
  inputRef?: (ref: InputRef) => void;
}

/** Input and an optional trailing action share one border and one minimum height. */
function InputFrame(props: TextInputProps & { search?: boolean; onClear?: () => void }) {
  const target = Product();
  const focused = signal(false);
  const editing = signal(false);
  const composing = signal(false);
  let input: InputRef | undefined;
  let navigation: ViewRef | undefined;
  let frame: number | undefined;
  const focusLater = (target: () => void) => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = undefined;
      target();
    });
  };
  cleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame);
  });
  const startEditing = () => {
    if (props.disabled || props.readonly) return;
    editing.set(true);
    focusLater(() => input?.focus());
  };
  effect(() => {
    if (target !== 'tv' || !focused() || props.readonly || composing() || props.disabled) return;
    const enter = keymap.bind(
      'enter',
      () => {
        if (editing()) props.onSubmit?.();
        else startEditing();
      },
      { when: 'always' },
    );
    const escape = editing()
      ? keymap.bind(
          'escape',
          () => {
            editing.set(false);
            focusLater(() => navigation?.focus());
          },
          { when: 'always' },
        )
      : undefined;
    cleanup(() => {
      enter();
      escape?.();
    });
  });
  return (
    <View
      ref={(ref) => (navigation = ref)}
      testID={
        target === 'tv' && !props.readonly && props.testID ? `${props.testID}-activate` : undefined
      }
      role={target === 'tv' && !props.readonly ? 'button' : undefined}
      accessibilityLabel={
        target === 'tv' && !props.readonly
          ? `${props.label}：${props.value || props.placeholder || '未输入'}`
          : undefined
      }
      focusable={target === 'tv' && !editing() && !props.disabled && !props.readonly}
      onPress={target === 'tv' && !props.readonly ? startEditing : undefined}
      onFocus={() => {
        if (target === 'tv') focused.set(true);
      }}
      onBlur={() => {
        if (target === 'tv' && !editing()) focused.set(false);
      }}
      class={`flex-row items-center min-w-0 rounded-(--radius) ${props.disabled ? 'bg-muted' : 'bg-card'}`}
      style={{
        minHeight: controlMetrics().height,
        borderRadius: controlMetrics().radius,
        outlineWidth: focused() ? 2 : 1,
        outlineColor: token(props.invalid ? 'destructive' : focused() ? 'ring' : 'input'),
        outlineOffset: focused() ? 3 : -1,
      }}
    >
      <If when={props.search}>
        <View style={{ paddingLeft: controlMetrics().paddingHorizontal }}>
          <Icon name="search" />
        </View>
      </If>
      <If when={target !== 'tv' || editing() || !!props.readonly}>
        <BaseInput
          ref={(ref) => {
            input = ref;
            props.inputRef?.(ref);
          }}
          testID={props.testID}
          value={props.value}
          onChange={(event) => {
            if (!props.disabled && !props.readonly) props.onChange(event);
          }}
          onSubmit={() => {
            if (!composing() && !props.disabled) props.onSubmit?.();
          }}
          submitBehavior="submit"
          placeholder={props.placeholder}
          readonly={!!props.readonly || (target === 'tv' && !editing())}
          focusable={target !== 'tv' || editing() || !!props.readonly}
          disabled={props.disabled}
          keyboardType={props.keyboardType}
          maxLength={props.maxLength}
          autoComplete={props.autoComplete}
          onCompositionChange={(event) => {
            composing.set(event.composing);
            props.onCompositionChange?.(event);
          }}
          onFocus={() => focused.set(true)}
          onBlur={() => {
            focused.set(false);
            editing.set(false);
          }}
          accessibilityLabel={props.label}
          accessibilityDescription={props.description}
          accessibilityState={{ invalid: !!props.invalid, disabled: !!props.disabled }}
          class="flex-1 min-w-0 bg-transparent text-foreground border-0"
          style={{
            minHeight: controlMetrics().height,
            fontSize: controlMetrics().fontSize,
            paddingHorizontal: controlMetrics().paddingHorizontal,
            paddingVertical: controlMetrics().paddingVertical,
          }}
        />
      </If>
      <If when={target === 'tv' && !editing() && !props.readonly}>
        <View
          class="flex-1 min-w-0 justify-center"
          style={{
            minHeight: controlMetrics().height,
            paddingHorizontal: controlMetrics().paddingHorizontal,
            paddingVertical: controlMetrics().paddingVertical,
          }}
        >
          <Text
            class={props.value ? 'text-foreground' : 'text-muted-foreground'}
            style={{ fontSize: controlMetrics().fontSize }}
          >
            {props.value || props.placeholder || ''}
          </Text>
        </View>
      </If>
      <If when={props.search && !!props.value && !props.readonly}>
        <Button
          label="清空搜索"
          icon="close"
          iconOnly
          variant="quiet"
          disabled={props.disabled}
          testID={props.testID ? `${props.testID}-clear` : undefined}
          onPress={() => {
            props.onClear?.();
            if (target === 'tv' && !editing()) startEditing();
            else input?.focus();
          }}
        />
      </If>
    </View>
  );
}

/** A single line input; desktop edits directly, TV confirms editing and returns without clearing. */
export function TextInput(props: TextInputProps) {
  return InputFrame(props);
}

/** A visible field label, control and its adjacent help or error. The caller owns validation. */
export interface FieldProps {
  /** Visible field name. */
  label: string;
  /** Supporting guidance, used when no error exists. */
  description?: string;
  /** Validation failure, retained until the caller clears it. */
  error?: string;
  /** The named input or selection control. */
  children?: JSX.Element;
  /** Stable identifier for the complete field. */
  testID?: string;
}

/** Keeps label, control and validation on one reading spine. */
export function Field(props: FieldProps) {
  return (
    <View testID={props.testID} class="min-w-0 gap-2">
      <Text class="text-foreground font-medium" style={{ fontSize: controlMetrics().fontSize }}>
        {props.label}
      </Text>
      {props.children}
      <If when={props.error || props.description}>
        <Text
          role={props.error ? 'alert' : 'text'}
          class={props.error ? 'text-destructive' : 'text-muted-foreground'}
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.error || props.description}
        </Text>
      </If>
    </View>
  );
}

/** Related fields with a group name and group-owned explanation or error. */
export interface FieldGroupProps extends FieldProps {}

/** Preserves individual field accessibility while grouping related settings. */
export function FieldGroup(props: FieldGroupProps) {
  return (
    <View
      testID={props.testID}
      role="group"
      accessibilityLabel={props.label}
      accessibilityDescription={props.error || props.description}
      class="min-w-0 gap-4"
    >
      <Text
        role="header"
        class="text-foreground font-semibold"
        style={{ fontSize: Product() === 'tv' ? tvUnit(24) : 18 }}
      >
        {props.label}
      </Text>
      <If when={props.description && !props.error}>
        <Text
          class="text-muted-foreground"
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.description}
        </Text>
      </If>
      {props.children}
      <If when={props.error}>
        <Text
          role="alert"
          class="text-destructive"
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.error}
        </Text>
      </If>
    </View>
  );
}

/** Search composition; the caller owns query, clearing, submitting and pending state. */
export interface SearchFieldProps extends TextInputProps {
  /** Blocks repeat submission while retaining the input. */
  pending?: boolean;
  /** Field-level error, kept next to the input. */
  error?: string;
  /** Clears the query; defaults to a normal onChange request for empty text. */
  onClear?: () => void;
}

/** One input border, with input, clear and submit at the same size tier. */
export function SearchField(props: SearchFieldProps) {
  return (
    <Field label={props.label} description={props.description} error={props.error}>
      <View class="flex-row items-start min-w-0" style={{ gap: controlMetrics().gap }}>
        <View class="flex-1 min-w-0">
          <InputFrame
            label={props.label}
            value={props.value}
            onChange={props.onChange}
            onSubmit={() => {
              if (!props.pending) props.onSubmit?.();
            }}
            placeholder={props.placeholder}
            readonly={props.readonly}
            disabled={props.disabled}
            invalid={!!props.error || props.invalid}
            description={props.error || props.description}
            keyboardType={props.keyboardType}
            maxLength={props.maxLength}
            autoComplete={props.autoComplete}
            onCompositionChange={props.onCompositionChange}
            testID={props.testID}
            inputRef={props.inputRef}
            search
            onClear={() => (props.onClear ? props.onClear() : props.onChange({ value: '' }))}
          />
        </View>
        <Button
          label="搜索"
          primary
          disabled={props.disabled || props.pending}
          testID={props.testID ? `${props.testID}-submit` : undefined}
          onPress={() => {
            if (!props.pending) props.onSubmit?.();
          }}
        />
      </View>
    </Field>
  );
}

/** One stable, selectable option. Values are identifiers; labels are presentation. */
export interface ChoiceOption {
  /** Stable identifier used as the controlled value. */
  value: string;
  /** Human-readable title, allowed to wrap. */
  label: string;
  /** Unavailable options remain visible and are skipped by keyboard navigation. */
  disabled?: boolean;
}

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
}

/** Styled NSH Select; NSH owns popup placement, choice, keyboard, dismissal and source restoration. */
export function Select(props: SelectProps) {
  const open = signal(false);
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
      onOpenChange={(event) => open.set(event.open)}
      onChange={props.onChange}
      trigger={
        <Button
          label={props.label}
          displayLabel={
            props.options.find((option) => option.value === props.value)?.label ??
            props.placeholder ??
            props.label
          }
          icon="down"
          disabled={props.disabled}
          selectOpen={open()}
          buttonRef={props.selectRef}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          onPress={() => open.set(true)}
        />
      }
      popupClass="bg-popover border border-border rounded-(--radius) p-2"
      popupStyle={{ minWidth: Product() === 'tv' ? tvUnit(240) : 180 }}
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

/** Controlled boolean selection; NSH handles mixed state, activation and disabled behavior. */
export interface CheckboxProps {
  /** Name and visible label of the option. */
  label: string;
  /** Current checked value. */
  checked: boolean;
  /** Partial selection, taking priority over checked. */
  indeterminate?: boolean;
  /** Prevents changes. */
  disabled?: boolean;
  /** Reports the requested next checked value. */
  onChange: (event: { checked: boolean }) => void;
  /** Stable automation identifier. */
  testID?: string;
  /** Native focus target. */
  controlRef?: (ref: ViewRef) => void;
}

/** Checkbox with a fully styled box, mixed mark and label. */
export function Checkbox(props: CheckboxProps) {
  return (
    <BaseCheckbox
      ref={(ref) => props.controlRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      checked={props.checked}
      indeterminate={props.indeterminate}
      disabled={props.disabled}
      onChange={props.onChange}
      class="flex-row items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:text-muted-foreground"
      style={{ minHeight: controlMetrics().height }}
      indicatorClass="items-center justify-center rounded border border-input checked:bg-primary checked:border-primary indeterminate:bg-primary indeterminate:border-primary disabled:bg-muted"
      indicatorStyle={{
        width: Product() === 'tv' ? tvUnit(28) : 22,
        height: Product() === 'tv' ? tvUnit(28) : 22,
      }}
      indicator={
        <If when={props.checked || props.indeterminate}>
          <Icon
            name={props.indeterminate ? 'minus' : 'check'}
            color={token('primary-foreground')}
          />
        </If>
      }
    >
      <Text
        class={props.disabled ? 'text-muted-foreground' : 'text-foreground'}
        style={{ fontSize: controlMetrics().fontSize }}
      >
        {props.label}
      </Text>
    </BaseCheckbox>
  );
}

/** An immediately applied preference, controlled by the caller. */
export interface SwitchProps extends Omit<CheckboxProps, 'indeterminate'> {}

/** Switch with track and thumb states and shared reduced-motion handling. */
export function Switch(props: SwitchProps) {
  return (
    <BaseSwitch
      ref={(ref) => props.controlRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
      class="flex-row items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      style={{ minHeight: controlMetrics().height }}
      trackClass={`rounded-full bg-muted-foreground checked:bg-primary disabled:bg-muted ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
      trackStyle={{
        width: Product() === 'tv' ? tvUnit(64) : 48,
        height: Product() === 'tv' ? tvUnit(36) : 28,
        padding: Product() === 'tv' ? tvUnit(4) : 3,
      }}
      thumbClass={`rounded-full ${props.checked ? 'bg-primary-foreground' : 'bg-card'} ${reduceMotion() ? '' : 'transition-transform duration-100'}`}
      thumbStyle={{
        width: Product() === 'tv' ? tvUnit(28) : 22,
        height: Product() === 'tv' ? tvUnit(28) : 22,
        transform: [{ translateX: props.checked ? (Product() === 'tv' ? tvUnit(28) : 20) : 0 }],
      }}
    >
      <Text
        class={props.disabled ? 'text-muted-foreground' : 'text-foreground'}
        style={{ fontSize: controlMetrics().fontSize }}
      >
        {props.label}
      </Text>
    </BaseSwitch>
  );
}

/** One controlled value represented by visible, stable options. */
export interface ChoiceGroupProps {
  /** Accessible name of the group. */
  label: string;
  /** Selected stable identifier. */
  value: string;
  /** Visible options, in order. */
  options: ChoiceOption[];
  /** The chosen identifier; arrow activation follows NSH semantics. */
  onChange: (event: { value: string }) => void;
  /** Blocks the entire group. */
  disabled?: boolean;
  /** Stable group identifier; each option is suffixed with its value. */
  testID?: string;
}

/** A radio group with selected and focused states kept independent. */
export function ChoiceGroup(props: ChoiceGroupProps) {
  return (
    <View role="group" accessibilityLabel={props.label} testID={props.testID}>
      <RadioGroup class="flex-row flex-wrap gap-2">
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Radio
              checked={props.value === option().value}
              disabled={props.disabled || option().disabled}
              accessibilityLabel={option().label}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              onChange={() => props.onChange({ value: option().value })}
              class="items-center justify-center rounded-(--radius) border border-border bg-card hover:bg-accent checked:bg-accent checked:border-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:bg-muted"
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                paddingVertical: controlMetrics().paddingVertical,
              }}
            >
              <Text
                class={
                  props.value === option().value
                    ? 'font-semibold text-accent-foreground'
                    : 'text-foreground'
                }
                style={{ fontSize: controlMetrics().fontSize }}
              >
                {option().label}
              </Text>
            </Radio>
          )}
        </Each>
      </RadioGroup>
    </View>
  );
}

/** Controlled page sections; content remains owned by the caller. */
export interface TabsProps extends ChoiceGroupProps {}

/** NSH's automatically activated tabs, with consistent underline and focus treatment. */
export function Tabs(props: TabsProps) {
  return (
    <View role="group" accessibilityLabel={props.label} testID={props.testID}>
      <BaseTabs
        class="flex-row flex-wrap gap-2 border-b border-border"
        indicatorClass="bottom-0 h-0.5 bg-primary"
      >
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Tab
              selected={props.value === option().value}
              disabled={props.disabled || option().disabled}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              accessibilityLabel={option().label}
              onPress={() => props.onChange({ value: option().value })}
              class="items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                paddingVertical: controlMetrics().paddingVertical,
              }}
            >
              <Text
                class={
                  props.value === option().value
                    ? 'font-semibold text-primary'
                    : 'text-muted-foreground'
                }
                style={{ fontSize: controlMetrics().fontSize }}
              >
                {option().label}
              </Text>
            </Tab>
          )}
        </Each>
      </BaseTabs>
    </View>
  );
}

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
    if (props.disabled && editing()) editing.set(false);
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
