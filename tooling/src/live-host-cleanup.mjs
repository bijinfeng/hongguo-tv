import { stop } from './dev.mjs';

/** Attempt every owned-host cleanup phase, even when process-group signalling fails. */
export async function stopLiveHost(host, group = false) {
  const errors = [];
  if (!host) return errors;
  const attempt = async (phase, operation) => {
    try {
      await operation();
    } catch (error) {
      errors.push(`${phase}: ${error.message}`);
    }
  };
  const signalGroup = (signal) => {
    if (!group || !host.pid) return;
    try {
      process.kill(-host.pid, signal);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  };
  await attempt('host group SIGTERM', () => signalGroup('SIGTERM'));
  await attempt('host process stop', () => stop(host));
  await attempt('host group SIGKILL', () => signalGroup('SIGKILL'));
  return errors;
}
