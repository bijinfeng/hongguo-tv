import { Button as BaseButton } from 'nsh/base';
import { FocusedRemovalRoot } from './focused-removal-root';
import {
  View,
  batch,
  cleanup,
  context,
  effect,
  keymap,
  signal,
  type JSX,
  type ViewProps,
  type ViewRef,
} from 'nsh';

interface CardMember {
  ref?: ViewRef;
  enabled: () => boolean;
  stop: () => boolean;
  activate: () => void;
  focus: () => void;
  blur: () => void;
}
interface Group {
  register: (enabled: () => boolean) => CardMember;
}
const Group = context<Group | undefined>(undefined);

/** Stable-slot card rows: the pressed item becomes the return stop before navigation.
 * shortcut: registration order is navigation order; use keyed row slots, not reordered members.
 */
export function CardControls(props: {
  label: string;
  class?: string;
  children?: JSX.Element;
  vertical?: boolean;
  onPreviousFromFirst?: () => void;
  onNavigate?: () => void;
}) {
  const members: CardMember[] = [];
  const current = signal<CardMember | undefined>(undefined);
  const focused = signal<CardMember | undefined>(undefined);
  const move = (step: 'next' | 'previous' | 'first' | 'last') => {
    const available = members.filter((member) => member.enabled());
    if (!available.length) return;
    props.onNavigate?.();
    const index = available.indexOf(current()!);
    if (step === 'previous' && index === 0 && props.onPreviousFromFirst) {
      props.onPreviousFromFirst();
      return;
    }
    const next =
      available[
        step === 'first'
          ? 0
          : step === 'last'
            ? available.length - 1
            : (index + (step === 'next' ? 1 : -1) + available.length) % available.length
      ];
    batch(() => current.set(next));
    next.ref?.focus();
  };
  effect(() => {
    if (!focused()) return;
    const unbind = keymap.bind(
      {
        [props.vertical ? 'down' : 'right']: () => move('next'),
        [props.vertical ? 'up' : 'left']: () => move('previous'),
        home: () => move('first'),
        end: () => move('last'),
      },
      { when: 'notEditing', repeat: true },
    );
    cleanup(unbind);
  });
  effect(() => {
    const prior = current();
    if (prior?.enabled()) return;
    const next = members.find((member) => member.enabled());
    const hadFocus = prior !== undefined && focused() === prior;
    batch(() => {
      current.set(next);
      if (hadFocus) focused.set(undefined);
    });
    if (hadFocus) next?.ref?.focus();
  });
  const group: Group = {
    register(enabled) {
      const member: CardMember = {
        enabled,
        stop: () => enabled() && current() === member,
        activate: () => {
          if (enabled()) batch(() => current.set(member));
        },
        focus: () => {
          current.set(member);
          focused.set(member);
        },
        blur: () => {
          if (focused() === member) focused.set(undefined);
        },
      };
      members.push(member);
      if (!current() && enabled()) current.set(member);
      cleanup(() => {
        const index = members.indexOf(member);
        if (index >= 0) members.splice(index, 1);
        if (current() === member) current.set(members.find((candidate) => candidate.enabled()));
        if (focused() === member) focused.set(undefined);
      });
      return member;
    },
  };
  return (
    <Group.Provider value={group}>
      <View
        role="toolbar"
        accessibilityLabel={props.label}
        class={`${props.vertical ? 'flex-col' : 'flex-row'} gap-3 ${props.class ?? ''}`}
      >
        {props.children}
      </View>
    </Group.Provider>
  );
}

/** BaseButton's private Toolbar registration cannot choose an app's source stop. */
export function CardRoot(props: {
  ref?: (ref: ViewRef) => void;
  testID?: string;
  accessibilityLabel: string;
  accessibilityDescription?: string;
  expanded?: boolean;
  selected?: boolean;
  disabled?: boolean;
  style?: ViewProps['style'];
  class?: string;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children?: JSX.Element;
}) {
  const member = Group()?.register(() => !props.disabled);
  if (!member) {
    const Root =
      props.onFocus ||
      props.onBlur ||
      props.expanded !== undefined ||
      props.accessibilityDescription
        ? FocusedRemovalRoot
        : BaseButton;
    return (
      <Root
        ref={(ref) => props.ref?.(ref)}
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        {...{ accessibilityDescription: props.accessibilityDescription, expanded: props.expanded }}
        selected={props.selected}
        disabled={props.disabled}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onPress={props.onPress}
        style={props.style}
        class={props.class}
      >
        {props.children}
      </Root>
    );
  }
  return (
    <View
      ref={(ref) => {
        member.ref = ref;
        props.ref?.({
          focus() {
            if (props.disabled) return;
            member.activate();
            ref.focus();
          },
          blur: () => ref.blur(),
          measure: () => ref.measure(),
          reveal: (options) => ref.reveal(options),
        });
      }}
      testID={props.testID}
      role="button"
      accessibilityLabel={props.accessibilityLabel}
      accessibilityHint={props.accessibilityDescription}
      accessibilityState={{
        selected: !!props.selected,
        disabled: !!props.disabled,
        expanded: props.expanded,
      }}
      disabled={props.disabled}
      focusable={!props.disabled && member.stop()}
      onFocus={() => {
        member.focus();
        props.onFocus?.();
      }}
      onBlur={() => {
        member.blur();
        props.onBlur?.();
      }}
      onPress={() => {
        member.activate();
        props.onPress?.();
      }}
      style={props.style}
      class={props.class}
    >
      {props.children}
    </View>
  );
}
