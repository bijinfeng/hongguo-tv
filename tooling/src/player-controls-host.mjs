/**
 * Runs the player controls host suite. See player-suite.mjs for the shared implementation.
 *
 * Kept as a thin entry for the same reason as player-host.mjs: the history records name it.
 *
 *   node tooling/src/player-controls-host.mjs web|macos|android
 */
import { playerHost } from './player-suite.mjs';

const target = process.argv[2];
await playerHost('controls', target);
