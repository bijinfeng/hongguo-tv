const SETTINGS_VALUE_MIN_WIDTH = 200;

import { Text, token, View, type JSX } from 'nsh';
import { controlMetrics, radius, space } from './foundation';
import { UiText } from './display';
import { textLineHeight, textSize, textWeight } from './typography';

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
    lineHeight: textLineHeight('body'),
    fontWeight: textWeight('body'),
    color: token('foreground'),
  });
  const hint = () => ({
    fontSize: textSize('meta'),
    lineHeight: textLineHeight('meta'),
    fontWeight: textWeight('meta'),
    color: token('muted-foreground'),
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
              borderRadius: radius('xl'),
            }
          : { gap: space('sm'), paddingVertical: space('md') }
      }
      class={card() ? 'bg-card border border-border' : 'border-b border-border'}
    >
      <View
        style={{ minHeight: controlMetrics().height, gap: space('lg') }}
        class="flex-row items-center justify-between"
      >
        <View class="flex-1" style={{ gap: space('xs') }}>
          <Text style={label()}>{props.label}</Text>
          <If when={props.description}>
            <Text style={hint()}>{props.description}</Text>
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
        <Text
          role="alert"
          style={{
            fontSize: textSize('meta'),
            fontWeight: textWeight('meta'),
            color: token('destructive'),
          }}
        >
          {props.error}
        </Text>
      </If>
    </View>
  );
}
