import { Text, reduceMotion } from 'nsh';
import { Switch as BaseSwitch } from 'nsh/base';
import { Product, tvUnit, controlMetrics } from './foundation';
import { type CheckboxProps } from './checkbox';

/** An immediately applied preference, controlled by the caller. */
export interface SwitchProps extends Omit<CheckboxProps, 'indeterminate'> {
  /** Hides the visible label where surrounding copy already names the setting; the accessible name stays. */
  labelHidden?: boolean;
}

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
      trackClass={`rounded-full ${props.disabled ? (props.checked ? 'bg-accent' : 'bg-border') : props.checked ? 'bg-primary-strong' : 'bg-muted-foreground'} ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
      trackStyle={{
        width: Product() === 'tv' ? tvUnit(64) : 48,
        height: Product() === 'tv' ? tvUnit(36) : 28,
        padding: Product() === 'tv' ? tvUnit(4) : 3,
      }}
      thumbClass={`rounded-full ${props.disabled ? (props.checked ? 'bg-accent-foreground' : 'bg-muted-foreground') : props.checked ? 'bg-primary-strong-foreground' : 'bg-card'} ${reduceMotion() ? '' : 'transition-transform duration-100'}`}
      thumbStyle={{
        width: Product() === 'tv' ? tvUnit(28) : 22,
        height: Product() === 'tv' ? tvUnit(28) : 22,
        transform: [{ translateX: props.checked ? (Product() === 'tv' ? tvUnit(28) : 20) : 0 }],
      }}
    >
      <If when={!props.labelHidden}>
        <Text
          class={props.disabled ? 'text-muted-foreground' : 'text-foreground'}
          style={{ fontSize: controlMetrics().fontSize }}
        >
          {props.label}
        </Text>
      </If>
    </BaseSwitch>
  );
}
