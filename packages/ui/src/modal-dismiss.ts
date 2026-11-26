import { context, effect, cleanup, keymap } from 'nsh';

interface DismissScope {
  register: (close: () => void) => () => void;
  cancel: () => void;
}
export const ModalDismissScope = context<DismissScope | undefined>(undefined);

/** Native modal Back reaches its window before a child popup; close the innermost layer first. */
export function createModalDismiss(close: () => void): DismissScope {
  const children: (() => void)[] = [];
  return {
    register(child) {
      children.push(child);
      return () => {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
      };
    },
    cancel() {
      const child = children.at(-1);
      if (child) child();
      else close();
    },
  };
}

export function registerModalPopup(open: () => boolean, close: () => void) {
  const parent = ModalDismissScope();
  effect(() => {
    if (parent && open()) cleanup(parent.register(close));
  });
}

export function bindModalEscape(open: () => boolean, close: () => void) {
  effect(() => {
    if (open()) cleanup(keymap.bind('escape', close, { when: 'notEditing' }));
  });
}
