import { Search, X } from 'nsh-icon-lucide';
import {
  Text,
  View,
  signal,
  effect,
  cleanup,
  keymap,
  platform,
  token,
  type InputHostProps,
  type InputRef,
  type ViewRef,
} from 'nsh';
import { Input as BaseInput } from 'nsh/base';
import {
  border,
  controlMetrics,
  focusOffset,
  focusOffsetInside,
  focusRing,
  weight,
  type ControlSize,
} from './foundation';
import { Button } from './button';
import { Icon } from './icon';
import { Field } from './field';
import { textLineHeightRatio } from './typography';

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
  /**
   * `direct` edits in place. `confirm` keeps the field as one focus stop: confirm opens
   * editing, and return leaves editing without discarding the draft.
   */
  activation?: 'direct' | 'confirm';
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
  /** Control density; the frame, text and trailing action share one tier. */
  size?: ControlSize;
  /** The actual native input, for focusing and selection. */
  inputRef?: (ref: InputRef) => void;
}

/** Input and an optional trailing action share one border and one minimum height. */
function InputFrame(props: TextInputProps & { search?: boolean; onClear?: () => void }) {
  const confirm = () => props.activation === 'confirm';
  const size = () => controlMetrics(props.size);
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
    if (!confirm() || !focused() || props.readonly || composing() || props.disabled) return;
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
      testID={confirm() && !props.readonly && props.testID ? `${props.testID}-activate` : undefined}
      role={confirm() && !props.readonly && !editing() ? 'button' : undefined}
      accessibilityLabel={
        confirm() && !props.readonly && !editing()
          ? `${props.label}：${props.value || props.placeholder || '未输入'}`
          : undefined
      }
      accessibilityDescription={
        confirm() && !props.readonly && !editing() ? props.description : undefined
      }
      accessibilityState={
        confirm() && !props.readonly && !editing()
          ? { disabled: !!props.disabled, invalid: !!props.invalid }
          : undefined
      }
      disabled={props.disabled}
      focusable={confirm() && !editing() && !props.disabled && !props.readonly}
      onPress={confirm() && !props.readonly && !editing() ? startEditing : undefined}
      onFocus={() => {
        if (confirm()) focused.set(true);
      }}
      onBlur={() => {
        if (confirm() && !editing()) focused.set(false);
      }}
      class={`flex-row items-center ${props.disabled ? 'bg-muted' : 'bg-card'}`}
      style={{
        minHeight: size().height,
        borderRadius: size().radius,
        outlineWidth: focused() && platform.os !== 'android' ? focusRing : border,
        outlineColor: token(
          props.invalid ? 'destructive' : focused() && platform.os !== 'android' ? 'ring' : 'input',
        ),
        outlineOffset: focused() && platform.os !== 'android' ? focusOffset : focusOffsetInside,
      }}
    >
      <If when={props.search}>
        <View style={{ paddingLeft: size().paddingHorizontal }}>
          <Icon icon={Search} />
        </View>
      </If>
      <If when={!confirm() || editing() || !!props.readonly}>
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
          readonly={!!props.readonly || (confirm() && !editing())}
          focusable={!confirm() || editing() || !!props.readonly}
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
          class="flex-1 bg-transparent border-0"
          style={{
            minHeight: size().height,
            fontSize: size().fontSize,
            lineHeight: size().lineHeight,
            color: token('foreground'),
            // The host placeholder default is too dim on the dark surface.
            placeholderColor: token('muted-foreground'),
            fontWeight: weight.regular(),
            paddingHorizontal: size().paddingHorizontal,
            paddingVertical: size().paddingVertical,
            outlineWidth: 0,
          }}
        />
      </If>
      <If when={confirm() && !editing() && !props.readonly}>
        <View
          class="flex-1 justify-center"
          style={{
            minHeight: size().height,
            paddingHorizontal: size().paddingHorizontal,
            paddingVertical: size().paddingVertical,
          }}
        >
          <Text
            style={{
              fontSize: size().fontSize,
              lineHeight: Math.round(size().fontSize * textLineHeightRatio('body')),
              fontWeight: weight.regular(),
              color: token(props.value ? 'foreground' : 'muted-foreground'),
            }}
          >
            {props.value || props.placeholder || ''}
          </Text>
        </View>
      </If>
      <If when={props.search && !!props.value && !props.readonly}>
        <Button
          label="清空搜索"
          icon={X}
          iconOnly
          variant="quiet"
          disabled={props.disabled}
          testID={props.testID ? `${props.testID}-clear` : undefined}
          onPress={() => {
            props.onClear?.();
            if (confirm() && !editing()) startEditing();
            else input?.focus();
          }}
        />
      </If>
    </View>
  );
}

/** A single line input; direct editing, or confirm mode where return leaves the draft intact. */
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
  const size = () => controlMetrics(props.size);
  return (
    <View accessibilityState={{ busy: !!props.pending }}>
      <Field label={props.label} description={props.description} error={props.error}>
        <View class="flex-row items-start" style={{ gap: size().gap }}>
          <View class="flex-1">
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
              activation={props.activation}
              size={props.size}
              search
              onClear={() => (props.onClear ? props.onClear() : props.onChange({ value: '' }))}
            />
          </View>
          <Button
            label="搜索"
            displayLabel={props.pending ? '搜索中…' : undefined}
            primary
            size={props.size}
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
