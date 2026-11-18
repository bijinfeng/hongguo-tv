import { signal, token, type InputRef, type InputHostProps } from 'nsh';
import { Input as BaseInput } from 'nsh/base';
import {
  border,
  controlMetrics,
  focusOffset,
  focusOffsetInside,
  focusRing,
  space,
  type ControlSize,
} from './foundation';

/** Shared application-search input; the caller supplies the current validation explanation. */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: (ref: InputRef) => void;
  embedded?: boolean;
  expanded?: boolean;
  /** Control density of the field. */
  size?: ControlSize;
  invalid?: boolean;
  description?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onCompositionChange?: InputHostProps['onCompositionChange'];
}
export function SearchInput(props: SearchInputProps) {
  const size = () => controlMetrics(props.size);
  const focused = signal(false);
  return (
    <BaseInput
      style={{
        minHeight: size().height,
        borderRadius: size().radius,
        fontSize: size().fontSize,
        paddingHorizontal: props.embedded ? space('xxs') : size().paddingHorizontal,
        paddingVertical: size().paddingVertical,
        outlineWidth: props.embedded ? 0 : focused() ? focusRing : border,
        outlineColor: token(props.invalid ? 'destructive' : focused() ? 'ring' : 'input'),
        outlineOffset: props.embedded ? 0 : focused() ? focusOffset : focusOffsetInside,
      }}
      testID="search-input"
      ref={props.inputRef}
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      onSubmit={props.onSubmit}
      submitBehavior="submit"
      onFocus={() => {
        focused.set(true);
        props.onFocus?.();
      }}
      onBlur={() => {
        focused.set(false);
        props.onBlur?.();
      }}
      onCompositionChange={props.onCompositionChange}
      accessibilityState={{ expanded: !!props.expanded, hasPopup: true, invalid: !!props.invalid }}
      placeholder="搜索短剧、演员"
      accessibilityLabel="搜索短剧、演员"
      accessibilityDescription={props.description}
      class={`flex-1 border-0 text-foreground ${props.embedded ? 'bg-transparent' : 'bg-card'}`}
    />
  );
}
