import { Text, reduceMotion, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { Product, tvUnit } from './foundation';
import { motionTokens } from './motion';

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
  testID?: string;
}
export function DateChoice(props: DateChoiceProps) {
  const parts = () => dateParts(props.value);
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
          class="flex-1 items-center justify-center rounded-(--radius) border border-input bg-card hover:bg-muted active:bg-border selected:bg-accent selected:border-transparent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
          style={{
            minWidth: Product() === 'tv' ? tvUnit(164) : 86,
            minHeight: Product() === 'tv' ? tvUnit(132) : 96,
            ...(Product() === 'tv' ? { borderRadius: tvUnit(12), borderWidth: tvUnit(1) } : {}),
            flexShrink: 0,
            padding: Product() === 'tv' ? tvUnit(16) : 12,
            gap: Product() === 'tv' ? tvUnit(6) : 4,
            transitionProperty: 'colors',
            transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
          }}
        >
          <Text
            class={`text-sm text-center ${props.selected ? 'text-accent-foreground' : 'text-muted-foreground'}`}
            style={Product() === 'tv' ? { fontSize: tvUnit(22) } : undefined}
          >
            {props.label}
          </Text>
          <Text
            class={`text-xl font-semibold text-center tabular-nums ${props.selected ? 'text-accent-foreground' : 'text-foreground'}`}
            style={Product() === 'tv' ? { fontSize: tvUnit(32) } : undefined}
          >
            {String(date().day)}
          </Text>
          <Text
            class={`text-sm text-center ${props.selected ? 'text-accent-foreground' : 'text-muted-foreground'}`}
            style={Product() === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          >
            {`${date().month} 月`}
          </Text>
        </CardRoot>
      )}
    </If>
  );
}
