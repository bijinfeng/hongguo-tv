import { Text, View, reduceMotion, token, type ViewRef } from 'nsh';
import { CardRoot } from './card-controls';
import { UiText } from './display';
import { border, controlMetrics, space, weight, type ControlSize } from './foundation';
import { motionTokens } from './motion';
import { textLineHeightRatio } from './typography';

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
  const foreground = () => token(props.selected ? 'accent-foreground' : 'foreground');
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
        minWidth: metrics().height * 4,
        borderRadius: metrics().radius,
        borderWidth: border,
        paddingHorizontal: metrics().paddingHorizontal,
        paddingVertical: space('sm'),
        gap: space('xxs'),
        transitionProperty: 'colors',
        transitionDuration: reduceMotion() ? 0 : motionTokens.fast,
      }}
    >
      <View accessibilityElementsHidden>
        <Text
          style={{
            fontSize: metrics().fontSize,
            lineHeight: Math.round(metrics().fontSize * textLineHeightRatio('body')),
            fontWeight: weight.strong(),
            color: foreground(),
          }}
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
