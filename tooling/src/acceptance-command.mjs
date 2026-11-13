import { spawn, spawnSync } from 'node:child_process';

/** Cancel only this command's process tree before restoring host acceptance settings. */
export async function acceptanceCommand(command, args, options, signal) {
  signal.throwIfAborted();
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const kill = (force) => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else {
      try {
        process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  };
  let timedOut = false;
  let escalation;
  const cancel = () => {
    kill(false);
    escalation ??= setTimeout(() => kill(true), 500);
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, options.timeoutMs ?? 600000);
  signal.addEventListener('abort', cancel, { once: true });
  let report = '';
  const collect = (chunk) => {
    report += chunk;
    options.onOutput?.(chunk);
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        if (signal.aborted) reject(signal.reason);
        else if (timedOut) reject(new Error(`${command} timed out\n${report}`));
        else if (code !== 0) reject(new Error(`${command} exited ${code}\n${report}`));
        else resolve();
      });
    });
    return report;
  } finally {
    signal.removeEventListener('abort', cancel);
    clearTimeout(timeout);
    if (signal.aborted || timedOut) {
      // A wrapper can exit before its children; keep the group owned through escalation.
      await new Promise((resolve) => setTimeout(resolve, 500));
      kill(true);
    }
    clearTimeout(escalation);
  }
}
