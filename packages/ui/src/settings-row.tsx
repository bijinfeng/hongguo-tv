const SETTINGS_VALUE_MIN_WIDTH = 200;

import { Text, View, type JSX } from 'nsh';
import { controlMetrics, space } from './foundation';
import { UiText } from './display';
import { textSize } from './typography';

/**
 * One setting: the label and its explanation on the start side, the confirmed value or
 * the control that changes it on the end side. The caller owns the value and saving.
 */
export interface SettingsRowProps {
  label: string;
  description?: string;
  value?: string;
  error?: string;
  /** `card` gives the row its own surface; `divided` keeps the shared list form. */
  variant?: 'divided' | 'card';
  children?: JSX.Element;
  testID?: string;
}

/**
 * @description Two-column setting row. `divided` follows the component board's settings
 * list: bold label, hint underneath, a hairline between rows and the control aligned on
 * the end side. `card` isolates one row when it is not part of a list.
 */
export function SettingsRow(props: SettingsRowProps) {
  const card = () => props.variant === 'card';
  const label = () => ({
    fontSize: textSize('body'),
    lineHeight: textSize('body') * 1.5,
  });
  const hint = () => ({
    fontSize: textSize('meta'),
    lineHeight: textSize('meta') * 1.5,
  });
  return (
    <View
      testID={props.testID}
      style={
        card()
          ? {
              gap: space('sm'),
              paddingVertical: space('md'),
              paddingHorizontal: space('md'),
              borderRadius: space('sm'),
            }
          : { gap: space('sm'), paddingVertical: space('md') }
      }
      class={card() ? 'bg-card border border-border' : 'border-b border-border'}
    >
      <View
        style={{ minHeight: controlMetrics().height, gap: space('lg') }}
        class="flex-row items-center justify-between"
      >
        <View class="flex-1 min-w-0" style={{ gap: space('xs') }}>
          <Text class="font-semibold text-foreground" style={label()}>
            {props.label}
          </Text>
          <If when={props.description}>
            <Text class="text-muted-foreground" style={hint()}>
              {props.description}
            </Text>
          </If>
        </View>
        <View
          class="flex-row items-center justify-end"
          style={{ gap: space('sm'), minWidth: SETTINGS_VALUE_MIN_WIDTH }}
        >
          <If when={props.value}>
            <UiText tone="muted">{props.value}</UiText>
          </If>
          {props.children}
        </View>
      </View>
      <If when={props.error}>
        <Text role="alert" style={{ fontSize: controlMetrics().fontSize }} class="text-destructive">
          {props.error}
        </Text>
      </If>
    </View>
  );
}
