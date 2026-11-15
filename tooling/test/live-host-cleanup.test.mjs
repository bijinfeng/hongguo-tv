import assert from 'node:assert/strict';
import { test } from 'node:test';
import { child } from '../src/process.mjs';
import { stopLiveHost } from '../src/live-host-cleanup.mjs';

// Real owned processes with controlled signalling failures; no content acceptance here.
for (const failure of ['none', 'group', 'process']) {
  test(
    `live host cleanup completes remaining phases after ${failure} failure`,
    { skip: process.platform === 'win32', timeout: 10000 },
    async (t) => {
      const host = child(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true,
        stdio: 'ignore',
      });
      const signal = process.kill.bind(process);
      t.after(() => {
        try {
          signal(-host.pid, 'SIGKILL');
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
      });
      const groupSignals = [];
      let inject = true;
      t.mock.method(process, 'kill', (pid, requested) => {
        if (pid === -host.pid) {
          groupSignals.push(requested);
          if (inject && failure === 'group' && requested === 'SIGTERM')
            throw Object.assign(new Error('controlled group EPERM'), { code: 'EPERM' });
          if (inject && failure === 'process' && requested === 'SIGTERM') return true;
        }
        return signal(pid, requested);
      });
      if (failure === 'process')
        t.mock.method(host, 'kill', () => {
          throw new Error('controlled process stop failure');
        });
      const errors = await stopLiveHost(host, true);
      await host.done.catch(() => {});
      assert.notEqual(host.signalCode, null, 'the owned process must actually terminate');
      assert.deepEqual(groupSignals, ['SIGTERM', 'SIGKILL']);
      if (failure === 'group') assert.equal(host.signalCode, 'SIGTERM');
      if (failure === 'none') assert.deepEqual(errors, []);
      else {
        assert.equal(errors.length, 1);
        assert.match(errors[0], failure === 'group' ? /SIGTERM.*EPERM/ : /process stop.*failure/);
      }
      inject = false;
      assert.deepEqual(await stopLiveHost(host, true), [], 'completed cleanup is repeatable');
    },
  );
}
