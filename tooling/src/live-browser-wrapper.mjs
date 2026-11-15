#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

// NSH binds its random web origin before launching --browser. Configure the real API before navigation.
const {
  HONGGUO_LIVE_HANDSHAKE: file,
  HONGGUO_LIVE_NONCE: nonce,
  HONGGUO_LIVE_BROWSER: browser,
  HONGGUO_LIVE_DEADLINE: deadlineValue,
} = process.env;
if (!file || !nonce || !browser) throw new Error('Expected the live acceptance handshake');
const deadline = Number(deadlineValue);
if (!Number.isFinite(deadline) || deadline <= Date.now())
  throw new Error('Expected the live browser deadline');
const listeners = execFileSync(
  '/usr/sbin/lsof',
  ['-nP', '-a', '-p', String(process.ppid), '-iTCP', '-sTCP:LISTEN', '-Fn'],
  { encoding: 'utf8' },
);
const addresses = listeners.split('\n').filter((line) => line.startsWith('n'));
if (addresses.length !== 1 || !/^n127\.0\.0\.1:[1-9]\d{0,4}$/.test(addresses[0]))
  throw new Error('Expected one NSH loopback listener');
const origin = 'http://' + addresses[0].slice(1);
if (Number(new URL(origin).port) > 65535) throw new Error('Invalid NSH listener port');
await writeFile(file + '.request.tmp', JSON.stringify({ nonce, origin, nshPid: process.ppid }));
await rename(file + '.request.tmp', file + '.request.json');
while (true) {
  if (Date.now() >= deadline) throw new Error('Live browser origin handshake timed out');
  try {
    const ack = JSON.parse(await readFile(file + '.ack.json', 'utf8'));
    if (ack.nonce !== nonce || ack.origin !== origin) throw new Error('Origin ACK differs');
    break;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await pause(25);
}
// Keep the PID owned by NSH so its normal and forced cleanup also owns Chrome.
process.execve(browser, [browser, ...process.argv.slice(2)], process.env);
