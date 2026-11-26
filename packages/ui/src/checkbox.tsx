import { Text, token, type ViewRef } from 'nsh';
import { Checkbox as BaseCheckbox } from 'nsh/base';
import {
  border,
  controlMetrics,
  radius,
  space,
  weight,
  type ControlSize,
  focusRingClass,
} from './foundation';
import { Icon } from './icon';
import { Check, Minus } from 'nsh-icon-lucide';

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
  /** Control density; the box follows the label size. */
  size?: ControlSize;
  /** Stable automation identifier. */
  testID?: string;
  /** Native focus target. */
  controlRef?: (ref: ViewRef) => void;
}

/** Checkbox with a fully styled box, mixed mark and label. */
export function Checkbox(props: CheckboxProps) {
  const size = () => controlMetrics(props.size);
  // The box tracks the label type size so a denser control keeps a proportionate mark.
  const box = () => Math.round(size().fontSize * 1.4);
  return (
    <BaseCheckbox
      ref={(ref) => props.controlRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      checked={props.checked}
      indeterminate={props.indeterminate}
      disabled={props.disabled}
      onChange={props.onChange}
      class={`flex-row items-center ${focusRingClass(2)}`}
      style={{ minHeight: size().height, gap: space('sm') }}
      indicatorClass={`items-center justify-center rounded border ${
        props.disabled
          ? props.checked || props.indeterminate
            ? 'bg-accent border-border'
            : 'bg-muted border-border'
          : 'border-input checked:bg-primary-strong checked:border-primary-strong indeterminate:bg-primary-strong indeterminate:border-primary-strong'
      }`}
      indicatorStyle={{
        width: box(),
        height: box(),
        borderWidth: border,
        borderRadius: radius('sm'),
      }}
      indicator={
        <If when={props.checked || props.indeterminate}>
          <Icon
            icon={props.indeterminate ? Minus : Check}
            tone={props.disabled ? 'accent-foreground' : 'primary-strong-foreground'}
            size={props.size}
          />
        </If>
      }
    >
      <Text
        style={{
          fontSize: size().fontSize,
          fontWeight: weight.regular(),
          color: token(props.disabled ? 'muted-foreground' : 'foreground'),
        }}
      >
        {props.label}
      </Text>
    </BaseCheckbox>
  );
}
