/**
 * Argument parsing shared by the host suites under `apps/harness`.
 *
 * Five suites grew the same twenty lines by hand: reject an unknown platform, allow `--foreground`
 * only on macOS, take `--filter` with a value, reject anything else. Hand-writing it went wrong
 * twice — `--foreground` was first treated as value-taking, and an unknown flag produced a
 * misleading "expected --product" message.
 *
 * `node:util.parseArgs` does the same job in strict mode and is already in the standard library, so
 * this keeps the tooling at zero dependencies while deleting the parser instead of centralising it.
 * What stays here is the part that is ours: which hosts a suite accepts, the macOS-only rule, and
 * the per-suite error wording that a failed run shows a reader.
 */
import { parseArgs } from 'node:util';

/**
 * Parses `process.argv.slice(2)` for a host suite.
 *
 * @param {{ hosts: string[], options?: Record<string, object>, message?: string }} config
 *   `hosts` are the accepted platform names, in the order the error message lists them.
 *   `options` adds suite-specific flags, in `parseArgs` form (`{ product: { type: 'string' } }`).
 *   `message` overrides the text for arguments this suite does not accept.
 */
export function hostArgs({ hosts, options = {}, message } = {}) {
  if (!hosts) throw new Error('hostArgs requires the accepted hosts');
  // `parseArgs` wants the leading dashes off, and rejects unknown flags before we see them.
  const names = Object.keys(options);
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      foreground: { type: 'boolean' },
      filter: { type: 'string' },
      ...options,
    },
    allowPositionals: true,
    strict: true,
  });

  const [host, ...rest] = positionals;
  if (!hosts.includes(host)) throw new Error(`Expected ${hosts.join('|')}`);
  if (rest.length) throw new Error(message ?? 'Expected only the documented flags');
  if (values.foreground && host !== 'macos')
    throw new Error('--foreground is available only on macos');

  const flags = new Map(names.map((name) => [`--${name}`, values[name]]));
  return { host, foreground: values.foreground === true, filter: values.filter, flags };
}
