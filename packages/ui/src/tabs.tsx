import { Text, View, token } from 'nsh';
import { Tabs as BaseTabs, Tab } from 'nsh/base';
import { border, controlMetrics, space, weight } from './foundation';
import { type ChoiceGroupProps } from './choice-group';

/** Controlled page sections; content remains owned by the caller. */
export interface TabsProps extends ChoiceGroupProps {}

/** NSH's automatically activated tabs, with consistent underline and focus treatment. */
export function Tabs(props: TabsProps) {
  const size = () => controlMetrics(props.size);
  const inactive = (option: { disabled?: boolean }) => !!props.disabled || !!option.disabled;
  const selectedDisabled = () =>
    !!props.disabled || !!props.options.find((option) => option.value === props.value)?.disabled;
  return (
    <View role="group" accessibilityLabel={props.label} testID={props.testID}>
      <BaseTabs
        class="flex-row flex-wrap border-b border-border"
        style={{ gap: space('xs') }}
        indicatorClass={selectedDisabled() ? 'bg-muted-foreground' : 'bg-primary'}
        indicatorStyle={{ bottom: -border, height: border * 2, zIndex: 1 }}
      >
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Tab
              selected={props.value === option().value}
              disabled={props.disabled || option().disabled}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              accessibilityLabel={option().label}
              onPress={() => props.onChange({ value: option().value })}
              class={`items-center justify-center focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${inactive(option()) || props.value === option().value ? '' : 'hover:bg-muted'}`}
              style={{
                minHeight: size().height,
                paddingHorizontal: size().paddingHorizontal,
                paddingVertical: size().paddingVertical,
              }}
            >
              <Text
                style={{
                  fontSize: size().fontSize,
                  fontWeight: props.value === option().value ? weight.strong() : weight.regular(),
                  color: token(inactive(option()) ? 'muted-foreground' : 'foreground'),
                }}
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
