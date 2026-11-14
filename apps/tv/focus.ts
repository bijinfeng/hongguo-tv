import { host } from 'nsh';

/** Public Android focus IDs, forwarded without UI or business decisions. */
export function subscribeFocus(receive: (id: string | undefined) => void) {
  const focus = host.on('focus-identity', (value) => {
    if (typeof value === 'string') receive(value);
  });
  const intent = host.on('focus-intent', () => receive(undefined));
  return () => {
    focus();
    intent();
  };
}
