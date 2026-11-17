import { Text, View, reduceMotion, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { UiText } from './display';
import { Product, controlMetrics, tvUnit, type ControlSize } from './foundation';
import { motionTokens } from './motion';

/** A caller-owned season choice; availability, playback and history stay outside UI. */
export interface SeasonChoiceProps {
  title: string;
  status?: string;
  selected: boolean;
  onPress: () => void;
  size?: ControlSize;
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
  onFocus?: () => void;
}

/** Two text levels, one target; focus never changes the caller's selection. */
export function SeasonChoice(props: SeasonChoiceProps) {
  const metrics = () => controlMetrics(props.size);
  return (
    <CardRoot
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={[props.title, props.status].filter(Boolean).join('，')}
      selected={props.selected}
      onPress={props.onPress}
      onFocus={props.onFocus}
      class={`shrink-0 items-start border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 ${props.selected ? 'bg-accent border-transparent' : 'bg-card border-input hover:bg-muted active:bg-border'}`}
      style={{
        minHeight: metrics().height,
        minWidth: Product() === 'tv' ? tvUnit(180) : undefined,
        borderRadius: metrics().radius,
        borderWidth: Product() === 'tv' ? tvUnit(1) : 1,
        paddingHorizontal: metrics().paddingHorizontal,
        paddingVertical: Product() === 'tv' ? tvUnit(16) : 12,
        gap: Product() === 'tv' ? tvUnit(4) : 4,
        transitionProperty: 'colors',
        transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
      }}
    >
      <View accessibilityElementsHidden>
        <Text
          style={{ fontSize: metrics().fontSize, lineHeight: metrics().fontSize * 1.5 }}
          class={`font-semibold ${props.selected ? 'text-accent-foreground' : 'text-foreground'}`}
        >
          {props.title}
        </Text>
      </View>
      <If when={props.status}>
        <View accessibilityElementsHidden>
          <UiText role="meta" tone={props.selected ? 'selected' : 'muted'}>
            {props.status}
          </UiText>
        </View>
      </If>
    </CardRoot>
  );
}
