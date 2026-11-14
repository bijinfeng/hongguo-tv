import { signal, token, type InputRef, type InputHostProps } from 'nsh';
import { Input as BaseInput } from 'nsh/base';
import { controlMetrics } from './foundation';

/** Shared application-search input; the caller supplies the current validation explanation. */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: (ref: InputRef) => void;
  embedded?: boolean;
  expanded?: boolean;
  invalid?: boolean;
  description?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onCompositionChange?: InputHostProps['onCompositionChange'];
}
export function SearchInput(props: SearchInputProps) {
  const focused = signal(false);
  return (
    <BaseInput
      style={{
        minHeight: controlMetrics().height,
        borderRadius: controlMetrics().radius,
        fontSize: controlMetrics().fontSize,
        paddingHorizontal: props.embedded ? 4 : controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
        outlineWidth: focused() ? 2 : props.embedded ? 0 : 1,
        outlineColor: token(props.invalid ? 'destructive' : focused() ? 'ring' : 'input'),
        outlineOffset: focused() ? 3 : -1,
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
