import { Text, reduceMotion, token } from 'nsh';
import { Switch as BaseSwitch } from 'nsh/base';
import { controlMetrics, space, weight, focusRingClass } from './foundation';
import { type CheckboxProps } from './checkbox';

/** An immediately applied preference, controlled by the caller. */
export interface SwitchProps extends Omit<CheckboxProps, 'indeterminate'> {
  /** Hides the visible label where surrounding copy already names the setting; the accessible name stays. */
  labelHidden?: boolean;
}

/** Switch with track and thumb states and shared reduced-motion handling. */
export function Switch(props: SwitchProps) {
  const size = () => controlMetrics(props.size);
  // Track, thumb and travel all derive from the label type size plus one spacing step,
  // so a denser control keeps the same proportions.
  const trackHeight = () => size().fontSize + space('sm');
  const trackPadding = () => space('xxs');
  const thumb = () => trackHeight() - trackPadding() * 2;
  return (
    <BaseSwitch
      ref={(ref) => props.controlRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.label}
      checked={props.checked}
      disabled={props.disabled}
      onChange={props.onChange}
      class={`flex-row items-center ${focusRingClass(2)}`}
      style={{ minHeight: size().height, gap: space('sm') }}
      trackClass={`rounded-full ${props.disabled ? (props.checked ? 'bg-accent' : 'bg-border') : props.checked ? 'bg-primary-strong' : 'bg-muted-foreground'} ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
      trackStyle={{
        width: Math.round(trackHeight() * 1.7),
        height: trackHeight(),
        padding: trackPadding(),
      }}
      thumbClass={`rounded-full ${props.disabled ? (props.checked ? 'bg-accent-foreground' : 'bg-muted-foreground') : props.checked ? 'bg-primary-strong-foreground' : 'bg-card'} ${reduceMotion() ? '' : 'transition-transform duration-100'}`}
      thumbStyle={{
        width: thumb(),
        height: thumb(),
        transform: [
          {
            translateX: props.checked
              ? Math.round(trackHeight() * 1.7) - thumb() - trackPadding() * 2
              : 0,
          },
        ],
      }}
    >
      <If when={!props.labelHidden}>
        <Text
          style={{
            fontSize: size().fontSize,
            lineHeight: size().lineHeight,
            fontWeight: weight.regular(),
            color: token(props.disabled ? 'muted-foreground' : 'foreground'),
          }}
        >
          {props.label}
        </Text>
      </If>
    </BaseSwitch>
  );
}
