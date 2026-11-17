import { Text, View } from 'nsh';
import { Tabs as BaseTabs, Tab } from 'nsh/base';
import { controlMetrics } from './foundation';
import { type ChoiceGroupProps } from './choice-group';

/** Controlled page sections; content remains owned by the caller. */
export interface TabsProps extends ChoiceGroupProps {}

/** NSH's automatically activated tabs, with consistent underline and focus treatment. */
export function Tabs(props: TabsProps) {
  return (
    <View role="group" accessibilityLabel={props.label} testID={props.testID}>
      <BaseTabs
        class="flex-row flex-wrap gap-2 border-b border-border"
        indicatorClass={`bottom-0 h-0.5 ${props.disabled || props.options.find((option) => option.value === props.value)?.disabled ? 'bg-muted-foreground' : 'bg-primary'}`}
        indicatorStyle={{ zIndex: 1 }}
      >
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Tab
              selected={props.value === option().value}
              disabled={props.disabled || option().disabled}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              accessibilityLabel={option().label}
              onPress={() => props.onChange({ value: option().value })}
              class={`items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${props.disabled || option().disabled ? 'bg-muted' : 'hover:bg-muted'}`}
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                paddingVertical: controlMetrics().paddingVertical,
              }}
            >
              <Text
                class={`${props.value === option().value ? 'font-semibold' : ''} ${props.disabled || option().disabled ? 'text-muted-foreground' : 'text-foreground'}`}
                style={{ fontSize: controlMetrics().fontSize }}
              >
                {option().label}
              </Text>
            </Tab>
          )}
        </Each>
      </BaseTabs>
    </View>
  );
}
