import { Text, View, type JSX } from 'nsh';
import { Product, tvUnit, controlMetrics } from './foundation';

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
}

/** Keeps label, control and validation on one reading spine. */
export function Field(props: FieldProps) {
  return (
    <View testID={props.testID} class="min-w-0 gap-2">
      <Text class="text-foreground font-medium" style={{ fontSize: controlMetrics().fontSize }}>
        {props.label}
      </Text>
      {props.children}
      <If when={props.error || props.description}>
        <Text
          role={props.error ? 'alert' : 'text'}
          class={props.error ? 'text-destructive' : 'text-muted-foreground'}
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
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
      class="min-w-0 gap-4"
    >
      <Text
        role="header"
        class="text-foreground font-semibold"
        style={{ fontSize: Product() === 'tv' ? tvUnit(24) : 18 }}
      >
        {props.label}
      </Text>
      <If when={props.description && !props.error}>
        <Text
          class="text-muted-foreground"
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.description}
        </Text>
      </If>
      {props.children}
      <If when={props.error}>
        <Text
          role="alert"
          class="text-destructive"
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.error}
        </Text>
      </If>
    </View>
  );
}
