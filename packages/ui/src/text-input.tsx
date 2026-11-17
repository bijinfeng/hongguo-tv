import {
  Text,
  View,
  signal,
  effect,
  cleanup,
  keymap,
  token,
  type InputHostProps,
  type InputRef,
  type ViewRef,
} from 'nsh';
import { Input as BaseInput } from 'nsh/base';
import { Product, controlMetrics } from './foundation';
import { Button } from './button';
import { Icon } from './icon';
import { Field } from './field';

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
      role={target === 'tv' && !props.readonly && !editing() ? 'button' : undefined}
      accessibilityLabel={
        target === 'tv' && !props.readonly && !editing()
          ? `${props.label}：${props.value || props.placeholder || '未输入'}`
          : undefined
      }
      accessibilityDescription={
        target === 'tv' && !props.readonly && !editing() ? props.description : undefined
      }
      accessibilityState={
        target === 'tv' && !props.readonly && !editing()
          ? { disabled: !!props.disabled, invalid: !!props.invalid }
          : undefined
      }
      disabled={props.disabled}
      focusable={target === 'tv' && !editing() && !props.disabled && !props.readonly}
      onPress={target === 'tv' && !props.readonly && !editing() ? startEditing : undefined}
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
    <View accessibilityState={{ busy: !!props.pending }}>
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
            displayLabel={props.pending ? '搜索中…' : undefined}
            primary
            disabled={props.disabled}
            pending={props.pending}
            testID={props.testID ? `${props.testID}-submit` : undefined}
            onPress={() => {
              if (!props.pending) props.onSubmit?.();
            }}
          />
        </View>
      </Field>
    </View>
  );
}
