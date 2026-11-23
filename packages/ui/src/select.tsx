import { Text, View, signal, effect, token, type ViewProps, type ViewRef } from 'nsh';
import { Select as BaseSelect, type SelectEntry } from 'nsh/base';
import { controlMetrics, radius, space, weight, type ControlSize } from './foundation';
import { Button } from './button';
import { Icon } from './icon';
import { textLineHeightRatio } from './typography';
import { type ChoiceOption } from './choice';

/**
 * The candidate row every Select popup shares. The row centres its content and sets the type
 * scale's line height, so a label sits on the row's centre line at any control size. The chosen
 * row carries only its check mark: `accent` belongs to the pointer's and the keyboard's cursor,
 * so a freshly opened list does not read as a second selection.
 */
export function selectItemClass() {
  return 'group justify-center text-popover-foreground hover:bg-muted focus:bg-accent disabled:text-muted-foreground';
}

/** Line height that centres a candidate's label in its row; the row keeps its own density. */
export function selectItemLineHeight(fontSize: number) {
  return Math.round(fontSize * textLineHeightRatio('body'));
}

/** A candidate's content: its title, and the check mark on the chosen row alone. */
export function SelectItemLabel(props: { entry: SelectEntry; size?: ControlSize }) {
  return (
    <View class="w-full flex-row items-center justify-between" style={{ gap: space('xs') }}>
      <Text style={{ flexShrink: 1, numberOfLines: 1 }}>{props.entry.title}</Text>
      <View class="opacity-0 group-selected:opacity-100">
        <Icon name="check" size={props.size} color={token('accent-foreground')} />
      </View>
    </View>
  );
}

/** Controlled selection from a bounded list. */
export interface SelectProps {
  /** Accessible name of the choice. */
  label: string;
  /** Current identifier, null when nothing is selected. */
  value: string | null;
  /** Options, in stable display order. */
  options: ChoiceOption[];
  /** Requested value after explicit choice. */
  onChange: (event: { value: string | null }) => void;
  /** Empty selection hint. */
  placeholder?: string;
  /** Prevents opening or changing. */
  disabled?: boolean;
  /** Control density for the trigger and the options. */
  size?: ControlSize;
  /** Stable identifier of the select. */
  testID?: string;
  /** Native root for focus restoration. */
  selectRef?: (ref: ViewRef) => void;
  /** Layout-only additions for composed rows; the trigger keeps control styling. */
  class?: string;
  /** Layout-only spacing override for the trigger, resolved after the control metrics. */
  style?: ViewProps['style'];
}

/** Wide enough for the longest current choice; the popup never shrinks below it. */
const MENU_MIN_WIDTH = 180;

/**
 * Styled NSH Select; NSH owns choice, keyboard, dismissal and source restoration.
 * `cover={false}` opens the list beside the trigger on every desktop instead of the
 * macOS pop-up-button default, where the chosen row sits over the trigger.
 */
export function Select(props: SelectProps) {
  const size = () => controlMetrics(props.size);
  const open = signal(false);
  effect(() => {
    if (props.disabled && open()) open.set(false);
  });
  return (
    <BaseSelect
      testID={props.testID}
      accessibilityLabel={props.label}
      items={props.options.map((option) => ({
        value: option.value,
        title: option.label,
        disabled: option.disabled,
      }))}
      value={props.value}
      disabled={props.disabled}
      open={open()}
      onOpenChange={(event) => {
        if (props.disabled && event.open) return;
        open.set(event.open);
      }}
      onChange={(event) => {
        if (!props.disabled) props.onChange(event);
      }}
      cover={false}
      offset={space('xxs')}
      trigger={
        <Button
          label={props.label}
          displayLabel={
            props.options.find((option) => option.value === props.value)?.label ??
            (props.value !== null ? '当前选项不可用' : (props.placeholder ?? props.label))
          }
          dropdown
          size={props.size}
          disabled={props.disabled}
          selectOpen={open()}
          popupOpen={open()}
          class={props.class}
          style={props.style}
          buttonRef={props.selectRef}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          onPress={() => open.set(true)}
        />
      }
      popupClass="bg-popover border border-border"
      popupStyle={{
        minWidth: MENU_MIN_WIDTH,
        padding: space('xxs'),
        borderRadius: radius('xl'),
      }}
      itemClass={selectItemClass()}
      itemStyle={{
        minHeight: size().height,
        fontSize: size().fontSize,
        fontWeight: weight.regular(),
        lineHeight: selectItemLineHeight(size().fontSize),
        borderRadius: radius('lg'),
        paddingHorizontal: space('sm'),
        paddingVertical: space('xxs'),
      }}
      empty={
        <Text
          style={{
            fontSize: size().fontSize,
            fontWeight: weight.regular(),
            color: token('muted-foreground'),
            paddingHorizontal: space('sm'),
            paddingVertical: size().paddingVertical,
          }}
        >
          暂无可选项
        </Text>
      }
      renderItem={(item) => <SelectItemLabel entry={item} size={props.size} />}
    />
  );
}
