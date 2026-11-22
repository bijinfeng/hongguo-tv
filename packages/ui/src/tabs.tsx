import { reduceMotion, View } from 'nsh';
import { Tabs as BaseTabs, Tab } from 'nsh/base';
import { border, controlMetrics, space, focusRingClass } from './foundation';
import { UiText } from './display';
import { type ChoiceGroupProps } from './choice-group';

/** Controlled page sections; content remains owned by the caller. */
export interface TabsProps extends ChoiceGroupProps {}

/**
 * NSH's automatically activated tabs, with consistent underline and focus treatment.
 * The label is drawn by the shared `UiText` layer: the host's own tab text does not paint on
 * every native theme, which left the TV account dialog with an unlabeled strip.
 */
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
              class={`items-center justify-center ${focusRingClass(2)} ${inactive(option()) || props.value === option().value ? '' : 'hover:bg-muted'}`}
              style={{
                minHeight: size().height,
                paddingHorizontal: size().paddingHorizontal,
                paddingVertical: size().paddingVertical,
              }}
            >
              {/* The accessible name stays on the tab; this text is its visible rendering.
                  The draft mutes the unselected labels and keeps the current one at foreground. */}
              <View
                class={`${reduceMotion() ? '' : 'transition-colors duration-100'} items-center justify-center`}
                style={{
                  minHeight: size().fontSize,
                  paddingHorizontal: 2,
                }}
              >
                <UiText
                  tone={
                    inactive(option())
                      ? 'muted'
                      : props.value === option().value
                        ? 'default'
                        : 'muted'
                  }
                  align="center"
                >
                  {option().label}
                </UiText>
              </View>
            </Tab>
          )}
        </Each>
      </BaseTabs>
    </View>
  );
}
