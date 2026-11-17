import { Text, token, type ViewRef } from 'nsh';
import { Checkbox as BaseCheckbox } from 'nsh/base';
import { Product, tvUnit, controlMetrics } from './foundation';
import { Icon } from './icon';

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
      indicatorClass={`items-center justify-center rounded border ${
        props.disabled
          ? props.checked || props.indeterminate
            ? 'bg-accent border-border'
            : 'bg-muted border-border'
          : 'border-input checked:bg-primary-strong checked:border-primary-strong indeterminate:bg-primary-strong indeterminate:border-primary-strong'
      }`}
      indicatorStyle={{
        width: Product() === 'tv' ? tvUnit(28) : 22,
        height: Product() === 'tv' ? tvUnit(28) : 22,
      }}
      indicator={
        <If when={props.checked || props.indeterminate}>
          <Icon
            name={props.indeterminate ? 'minus' : 'check'}
            color={token(props.disabled ? 'accent-foreground' : 'primary-strong-foreground')}
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
