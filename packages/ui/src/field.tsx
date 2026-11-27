import { Text, token, View, type JSX } from 'nsh';
import { controlMetrics, space, weight, type ControlSize } from './foundation';
import { textLineHeight, textSize } from './typography';

/** A visible field label, control and its adjacent help or error. The caller owns validation. */
export interface FieldProps {
  /** Visible field name. */
  label: string;
  /** Supporting guidance, used when no error exists. */
  description?: string;
  /** Validation failure, retained until the caller clears it. */
  error?: string;
  /** The named input or selection control. */
  children?: JSX.Element;
  /** Stable identifier for the complete field. */
  testID?: string;
  /** Label and help density; the control sets its own tier. */
  size?: ControlSize;
}

/** Keeps label, control and validation on one reading spine. */
export function Field(props: FieldProps) {
  return (
    <View testID={props.testID} style={{ gap: space('xs') }}>
      <Text
        style={{
          fontSize: controlMetrics(props.size).fontSize,
          fontWeight: weight.strong(),
          color: token('foreground'),
        }}
      >
        {props.label}
      </Text>
      {props.children}
      <If when={props.error || props.description}>
        <Text
          role={props.error ? 'alert' : 'text'}
          style={{
            fontSize: textSize('meta'),
            lineHeight: textLineHeight('meta'),
            fontWeight: weight.regular(),
            color: token(props.error ? 'destructive' : 'muted-foreground'),
          }}
        >
          {props.error || props.description}
        </Text>
      </If>
    </View>
  );
}

/** Related fields with a group name and group-owned explanation or error. */
export interface FieldGroupProps extends FieldProps {}

/** Preserves individual field accessibility while grouping related settings. */
export function FieldGroup(props: FieldGroupProps) {
  return (
    <View
      testID={props.testID}
      role="group"
      accessibilityLabel={props.label}
      accessibilityDescription={props.error || props.description}
      style={{ gap: space('md') }}
    >
      <Text
        role="header"
        style={{
          fontSize: textSize('content-title'),
          fontWeight: weight.strong(),
          color: token('foreground'),
        }}
      >
        {props.label}
      </Text>
      <If when={props.description && !props.error}>
        <Text
          style={{
            fontSize: textSize('meta'),
            lineHeight: textLineHeight('meta'),
            fontWeight: weight.regular(),
            color: token('muted-foreground'),
          }}
        >
          {props.description}
        </Text>
      </If>
      {props.children}
      <If when={props.error}>
        <Text
          role="alert"
          style={{
            fontSize: textSize('meta'),
            lineHeight: textLineHeight('meta'),
            fontWeight: weight.regular(),
            color: token('destructive'),
          }}
        >
          {props.error}
        </Text>
      </If>
    </View>
  );
}
