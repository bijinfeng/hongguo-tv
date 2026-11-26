import { View, cleanup, effect, type ViewRef } from 'nsh';
import { Button } from './button';
import { CardControls } from './card-controls';
import { UiText } from './display';
import { controlMetrics, space } from './foundation';

/** One stable, selectable option. */
export interface ChoiceListOption {
  value: string;
  title: string;
  disabled?: boolean;
}

/** A wrapping row of selectable labels; the caller owns the chosen value. */
export interface ChoiceListProps {
  /** Accessible name of the whole group. */
  label: string;
  value: string;
  items: ChoiceListOption[];
  onChange: (value: string) => void;
  /** Stable identifier prefix; each option becomes `${testID}-${value}`. */
  testID?: string;
  /** Called on focus and after a choice with the function that returns focus to the source stop. */
  onSource?: (restore: () => void) => void;
  /**
   * Builds the restore for an option. A page that can be superseded returns a guarded restore, so
   * a stale row cannot take the focus back from the page that replaced it.
   */
  restoreFor?: (value: string) => () => void;
  /** Called before a focus or choice moves the page. */
  onNavigate?: () => void;
  /** Reports each option's element, so a page can name its own primary focus stop. */
  onOptionRef?: (value: string, ref: ViewRef) => void;
  /** Called as an option takes focus; the ranking rows scroll a wrapped row into view. */
  onOptionFocus?: (ref: ViewRef) => void;
  /** Layout-only additions for the wrapping row. */
  class?: string;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * The product's only option row: one focus group, one `accent` pairing on the chosen option,
 * one geometry for the option and its gap. Pages pass values; they do not restyle the row, so a
 * page cannot drift to its own radius, minimum width or spacing.
 *
 * The options wrap instead of scrolling sideways, because a long category row that scrolls
 * sideways hides most of its choices behind an invisible edge.
 */
export function ChoiceList(props: ChoiceListProps) {
  const refs = new Map<string, ViewRef>();
  const source = (value: string) => props.restoreFor?.(value) ?? (() => refs.get(value)?.focus());
  return (
    <View style={{ paddingVertical: RING_RESERVE }}>
      <CardControls
        label={props.label}
        onNavigate={props.onNavigate}
        gap={space('xs')}
        vertical={props.orientation === 'vertical'}
        class={`${props.orientation === 'vertical' ? '' : 'flex-wrap'} ${props.class ?? ''}`}
      >
        {/*
          Slots are keyed by position, not by value: `CardControls` registers its members in mount
          order and never reorders them, so a value key would leave Home/End and the arrow keys
          walking the previous order after the service reorders or shortens the list.
        */}
        <Each of={Array.from({ length: props.items.length }, (_, index) => index)}>
          {(slot) => {
            const item = () => props.items[slot()];
            let ref: ViewRef | undefined;
            // Re-register whenever the slot reads another option: a reordered list rebinds each
            // slot, and a stale key would focus the wrong option.
            effect(() => {
              const value = item().value;
              if (!ref) return;
              refs.set(value, ref);
              props.onOptionRef?.(value, ref);
              cleanup(() => {
                if (refs.get(value) === ref) refs.delete(value);
              });
            });
            return (
              <If when={!!item()}>
                <Button
                  buttonRef={(node) => {
                    ref = node;
                  }}
                  onFocus={() => {
                    if (ref) props.onOptionFocus?.(ref);
                    props.onSource?.(source(item().value));
                  }}
                  size="sm"
                  variant="quiet"
                  testID={props.testID ? `${props.testID}-${item().value || 'all'}` : undefined}
                  label={item()?.title ?? ''}
                  labelLines={props.orientation === 'vertical' ? 2 : 1}
                  align={props.orientation === 'vertical' ? 'start' : undefined}
                  class={props.orientation === 'vertical' ? 'w-full' : undefined}
                  disabled={item()?.disabled}
                  selected={props.value === item()?.value}
                  onPress={() => {
                    const restore = source(item().value);
                    props.onChange(item().value);
                    props.onSource?.(restore);
                  }}
                />
              </If>
            );
          }}
        </Each>
      </CardControls>
    </View>
  );
}

/**
 * The same options behind a name column. The name says what the options change, so a reader
 * meeting the row out of context still knows the dimension; it sits on the first option line
 * rather than centred against a wrapped block that may be two lines tall.
 */
export function LabeledChoiceList(props: ChoiceListProps & { title: string }) {
  return (
    <View
      class={props.orientation === 'vertical' ? 'flex-col' : 'flex-row items-start'}
      style={{ gap: space(props.orientation === 'vertical' ? 'xs' : 'md') }}
    >
      <View
        class="justify-center"
        style={
          props.orientation === 'vertical'
            ? undefined
            : { width: LABEL_GUTTER, height: optionHeight() + RING_RESERVE * 2 }
        }
      >
        <UiText role="meta" tone="muted" lines={1}>
          {props.title}
        </UiText>
      </View>
      <View class={props.orientation === 'vertical' ? 'w-full min-w-0' : 'flex-1 min-w-0'}>
        <ChoiceList {...props} />
      </View>
    </View>
  );
}

/**
 * The widest service group name a panel carries in Chinese ("服务端时段" is five characters at
 * meta size). A longer upstream name ellipsizes here instead of shifting the options off the
 * shared spine every row starts on.
 */
const LABEL_GUTTER = 72;

/** Room for the option's focus outline: 2 units wide at a 4-unit offset. */
const RING_RESERVE = 6;

/** The option row's `sm` height; the name column matches it so its text shares that centre line. */
const optionHeight = () => controlMetrics('sm').height;
