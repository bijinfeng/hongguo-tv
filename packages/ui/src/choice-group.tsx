import { Text, View, token } from 'nsh';
import { Radio, RadioGroup } from 'nsh/base';
import { controlMetrics } from './foundation';
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
              class={`flex-row items-center justify-center rounded-(--radius) border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${props.disabled || option().disabled ? 'bg-muted border-transparent' : props.value === option().value ? 'bg-accent border-transparent' : 'bg-card border-input hover:bg-muted active:bg-border'}`}
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                paddingVertical: controlMetrics().paddingVertical,
                gap: controlMetrics().gap,
              }}
            >
              <View
                class={props.value === option().value ? '' : 'opacity-0'}
                style={{ width: controlMetrics().iconSize, height: controlMetrics().iconSize }}
              >
                <Icon
                  name="check"
                  color={token(
                    props.disabled || option().disabled ? 'muted-foreground' : 'accent-foreground',
                  )}
                />
              </View>
              <Text
                class={`${props.value === option().value ? 'font-semibold' : ''} ${props.disabled || option().disabled ? 'text-muted-foreground' : props.value === option().value ? 'text-accent-foreground' : 'text-foreground'}`}
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
