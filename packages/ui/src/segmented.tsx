import { View, type ViewProps } from 'nsh';
import { Button } from './button';
import { CardControls } from './card-controls';
import { space, type ControlSize } from './foundation';
import { type ChoiceOption } from './choice';

/**
 * One value chosen from a short set, laid out inline: the options sit on the row itself, so a
 * remote user chooses in one press instead of opening a popup and travelling to it. Selected
 * and focused stay independent (accent marks the value, the runtime ring marks the browse).
 */
export interface SegmentedProps {
  /** Accessible name of the group. */
  label: string;
  /** Selected stable identifier. */
  value: string;
  /** Options, in stable display order. */
  options: ChoiceOption[];
  /** The chosen identifier after an explicit press. */
  onChange: (event: { value: string }) => void;
  /** Blocks the entire group. */
  disabled?: boolean;
  /** Control density shared by every segment. */
  size?: ControlSize;
  /** Stable group identifier; each segment is suffixed with its value. */
  testID?: string;
  /** Layout-only additions for composed rows; the segments keep control styling. */
  class?: string;
  /** Layout-only spacing override, resolved after the control metrics. */
  style?: ViewProps['style'];
}

/** Inline segmented choice: the row wraps when the options outgrow it. */
export function Segmented(props: SegmentedProps) {
  return (
    <View style={props.style}>
      <CardControls
        label={props.label}
        gap={space('xs')}
        class={`flex-row flex-wrap items-center ${props.class ?? ''}`}
      >
        <Each of={props.options} key={(option) => option.value}>
          {(option) => (
            <Button
              size={props.size}
              variant="quiet"
              disabled={props.disabled}
              testID={props.testID ? `${props.testID}-${option().value}` : undefined}
              label={option().label}
              selected={props.value === option().value}
              onPress={() => props.onChange({ value: option().value })}
            />
          )}
        </Each>
      </CardControls>
    </View>
  );
}
