/**
 * Runs the player host suite. See player-suite.mjs for the shared implementation.
 *
 * This file is kept as a thin entry because commands of this exact shape appear in the frozen
 * history records; a record whose command no longer runs is not evidence.
 *
 *   node tooling/src/player-host.mjs web|macos|android
 */
import { playerHost } from './player-suite.mjs';

const target = process.argv[2];
await playerHost('player', target);
