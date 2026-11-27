/**
 * Runs the rankings host suite. See list-host.mjs for the shared implementation.
 *
 * Kept as a thin entry because this exact command appears in the frozen history records.
 *
 *   node tooling/src/rankings-host.mjs headless|web|macos [--foreground] [--filter text]
 */
import { listHost } from './list-host.mjs';

await listHost('rankings');
