import { Button, type ButtonProps } from './button';

/** A destination control with one owner for current state and remote focus. */
export interface NavigationItemProps extends Pick<
  ButtonProps,
  | 'label'
  | 'icon'
  | 'testID'
  | 'buttonRef'
  | 'onPress'
  | 'onFocus'
  | 'onBlur'
  | 'disabled'
  | 'accessibilityDescription'
  | 'class'
> {
  current?: boolean;
  currentSurface?: 'muted' | 'contrast';
  align?: 'start' | 'center';
  presentation?: 'rail' | 'bar';
}

/** Shared navigation styling; pages supply only the destination identity and action. */
export function NavigationItem(props: NavigationItemProps) {
  return (
    <Button
      {...props}
      variant={props.presentation === 'bar' ? 'navigation-bar' : 'navigation'}
      current={props.current}
      currentSurface={props.currentSurface}
      align={props.align}
    />
  );
}
