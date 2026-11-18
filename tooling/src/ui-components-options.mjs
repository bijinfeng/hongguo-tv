export const uiCommands = ['check', 'test', 'host-desktop', 'host-tv', 'preview'];
export const uiTargets = ['desktop', 'web', 'tv'];
/** One preview session per product, so a repeat replaces the window instead of adding another. */
export const previewPorts = { desktop: 8799, web: 8798, tv: 8797 };
/**
 * The two graphical hosts, one command each so a run opens one window. Each takes its density
 * from a manifest theme, not a prop: `web` carries `theme.json` (desktop density) and `tv` carries
 * `theme.tv.json`. `apps/desktop` is unused here because its manifest builds the Rust native app.
 */
export const hostProducts = { 'host-desktop': 'web', 'host-tv': 'tv' };

export function uiComponentsOptions(argv) {
  const [command, ...rest] = argv;
  if (!uiCommands.includes(command))
    throw new Error('Expected check|test|host-desktop|host-tv|preview');
  const host = command in hostProducts;
  const options = { command, target: 'desktop', explicit: false };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (value === undefined) throw new Error(`Expected a value after ${flag}`);
    if (flag === '--target' && !host) {
      if (!uiTargets.includes(value)) throw new Error('Expected --target desktop|web|tv');
      options.target = value;
      options.explicit = true;
    } else if (flag === '--display' && (command === 'preview' || host)) {
      const display = Number(value);
      if (!Number.isInteger(display) || display < 1)
        throw new Error('Expected --display 1 or a larger display number');
      options.display = display;
    } else if (flag === '--window-size' && command === 'preview') {
      if (!/^\d+x\d+$/.test(value)) throw new Error('Expected --window-size WIDTHxHEIGHT');
      options.windowSize = value;
    } else if (flag === '--port' && command === 'preview') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error('Expected --port 1-65535');
      options.port = port;
    } else {
      throw new Error(`Unknown option ${flag} for ${command}`);
    }
  }
  return options;
}

export function previewArgs(entry, target, native, { port, display, windowSize } = {}) {
  return [
    entry,
    '--target',
    native,
    '--port',
    String(port ?? previewPorts[target]),
    ...(display === undefined ? [] : ['--display', String(display)]),
    ...(windowSize === undefined ? [] : ['--window-size', windowSize]),
  ];
}

export function hostArgs(test, host, display) {
  // Background windows: NSH only takes the keyboard from the app in use with --foreground.
  return [
    'test',
    test,
    ...(host === undefined ? [] : ['--target', host]),
    ...(display === undefined ? [] : ['--display', String(display)]),
  ];
}
