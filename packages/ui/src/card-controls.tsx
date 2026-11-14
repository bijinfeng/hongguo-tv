import { Button as BaseButton } from 'nsh/base';
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
  stop: () => boolean;
  activate: () => void;
  focus: () => void;
  blur: () => void;
}
interface Group {
  register: () => CardMember;
}
const Group = context<Group | undefined>(undefined);

/** Stable-slot card rows: the pressed item becomes the return stop before navigation.
 * shortcut: registration order is navigation order; use keyed row slots, not reordered members.
 */
export function CardControls(props: { label: string; class?: string; children?: JSX.Element }) {
  const members: CardMember[] = [];
  const current = signal<CardMember | undefined>(undefined);
  const focused = signal<CardMember | undefined>(undefined);
  const move = (step: 'next' | 'previous' | 'first' | 'last') => {
    if (!members.length) return;
    const index = members.indexOf(current()!);
    const next =
      members[
        step === 'first'
          ? 0
          : step === 'last'
            ? members.length - 1
            : (index + (step === 'next' ? 1 : -1) + members.length) % members.length
      ];
    batch(() => current.set(next));
    next.ref?.focus();
  };
  effect(() => {
    if (!focused()) return;
    const unbind = keymap.bind(
      {
        right: () => move('next'),
        left: () => move('previous'),
        home: () => move('first'),
        end: () => move('last'),
      },
      { when: 'notEditing', repeat: true },
    );
    cleanup(unbind);
  });
  const group: Group = {
    register() {
      const member: CardMember = {
        stop: () => current() === member,
        activate: () => batch(() => current.set(member)),
        focus: () => {
          current.set(member);
          focused.set(member);
        },
        blur: () => {
          if (focused() === member) focused.set(undefined);
        },
      };
      members.push(member);
      if (!current()) current.set(member);
      cleanup(() => {
        const index = members.indexOf(member);
        if (index >= 0) members.splice(index, 1);
        if (current() === member) current.set(members[0]);
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
        class={`flex-row gap-3 ${props.class ?? ''}`}
      >
        {props.children}
      </View>
    </Group.Provider>
  );
}

/** BaseButton's private Toolbar registration cannot choose an app's source stop. */
export function CardRoot(props: {
  ref?: (ref: ViewRef) => void;
  testID: string;
  accessibilityLabel: string;
  selected?: boolean;
  style?: ViewProps['style'];
  class?: string;
  onPress: () => void;
  children?: JSX.Element;
}) {
  const member = Group()?.register();
  if (!member)
    return (
      <BaseButton
        ref={props.ref}
        testID={props.testID}
        accessibilityLabel={props.accessibilityLabel}
        selected={props.selected}
        onPress={props.onPress}
        style={props.style}
        class={props.class}
      >
        {props.children}
      </BaseButton>
    );
  return (
    <View
      ref={(ref) => {
        member.ref = ref;
        props.ref?.({
          focus() {
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
      accessibilityState={{ selected: !!props.selected }}
      focusable={member.stop()}
      onFocus={member.focus}
      onBlur={member.blur}
      onPress={() => {
        member.activate();
        props.onPress();
      }}
      style={props.style}
      class={props.class}
    >
      {props.children}
    </View>
  );
}
