import { Text, View, token } from 'nsh';
import { Radio, RadioGroup } from 'nsh/base';
import {
  border,
  controlMetrics,
  space,
  weight,
  type ControlSize,
  focusRingClass,
} from './foundation';
import { Icon } from './icon';
import { type ChoiceOption } from './choice';

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
  /** Control density shared by every option. */
  size?: ControlSize;
}

/** A radio group with selected and focused states kept independent. */
export function ChoiceGroup(props: ChoiceGroupProps) {
  const size = () => controlMetrics(props.size);
  const inactive = (option: ChoiceOption) => !!props.disabled || !!option.disabled;
  return (
    <View role="group" accessibilityLabel={props.label} testID={props.testID}>
      <RadioGroup class="flex-row flex-wrap" style={{ gap: space('xs') }}>
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Radio
              checked={props.value === option().value}
              disabled={props.disabled || option().disabled}
              accessibilityLabel={option().label}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              onChange={() => props.onChange({ value: option().value })}
              class={`flex-row items-center justify-center ${focusRingClass(2)} ${inactive(option()) ? 'bg-muted border-transparent' : props.value === option().value ? 'bg-accent border-transparent' : 'bg-card border-input hover:bg-muted active:bg-border'}`}
              style={{
                minHeight: size().height,
                borderRadius: size().radius,
                borderWidth: border,
                paddingHorizontal: size().paddingHorizontal,
                paddingVertical: size().paddingVertical,
                gap: size().gap,
              }}
            >
              <View
                class={props.value === option().value ? '' : 'opacity-0'}
                style={{ width: size().iconSize, height: size().iconSize }}
              >
                <Icon
                  name="check"
                  size={props.size}
                  color={token(inactive(option()) ? 'muted-foreground' : 'accent-foreground')}
                />
              </View>
              <Text
                style={{
                  fontSize: size().fontSize,
                  fontWeight: props.value === option().value ? weight.strong() : weight.regular(),
                  color: token(
                    inactive(option())
                      ? 'muted-foreground'
                      : props.value === option().value
                        ? 'accent-foreground'
                        : 'foreground',
                  ),
                }}
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
