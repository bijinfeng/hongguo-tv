import { Text, reduceMotion, token, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { border, controlMetrics, radius, space, weight, type ControlSize } from './foundation';
import { motionTokens } from './motion';
import { textSize, textWeight } from './typography';

function dateParts(value: string) {
  if (!/^\d{8}$/.test(value)) return;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6));
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year > 0 && month > 0 && month <= 12 && day > 0 && day <= days[month - 1])
    return { year, month, day };
}

/** Public date selection: real day, large date and month share one keyboard/accessible stop. */
export interface DateChoiceProps {
  value: string;
  selected: boolean;
  label: string;
  onPress: () => void;
  buttonRef?: (ref: ViewRef) => void;
  onFocus?: () => void;
  /** Control density; the calendar cell keeps its larger date inside the tier. */
  size?: ControlSize;
  testID?: string;
}
export function DateChoice(props: DateChoiceProps) {
  const size = () => controlMetrics(props.size);
  const parts = () => dateParts(props.value);
  const foreground = () => token(props.selected ? 'accent-foreground' : 'foreground');
  const muted = () => token(props.selected ? 'accent-foreground' : 'muted-foreground');
  return (
    <If when={parts()}>
      {(date) => (
        <CardRoot
          ref={(ref) => props.buttonRef?.(ref)}
          testID={props.testID}
          accessibilityLabel={`${date().year}年${date().month}月${date().day}日 ${props.label}`}
          selected={props.selected}
          onPress={props.onPress}
          onFocus={props.onFocus}
          class="flex-1 items-center justify-center border border-input bg-card hover:bg-muted active:bg-border selected:bg-accent selected:border-transparent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
          style={{
            minWidth: size().height * 2,
            minHeight: size().height * 2.4,
            borderRadius: radius('xl'),
            borderWidth: border,
            flexShrink: 0,
            padding: space('sm'),
            gap: space('xxs'),
            transitionProperty: 'colors',
            transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
          }}
        >
          <Text
            style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta'), color: muted() }}
          >
            {props.label}
          </Text>
          <Text
            style={{
              fontSize: textSize('title'),
              fontWeight: weight.strong(),
              color: foreground(),
            }}
          >
            {String(date().day)}
          </Text>
          <Text
            style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta'), color: muted() }}
          >
            {`${date().month} 月`}
          </Text>
        </CardRoot>
      )}
    </If>
  );
}
