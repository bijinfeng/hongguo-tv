import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptanceCommand } from '../src/acceptance-command.mjs';

const node = process.execPath;
test('acceptance command preserves output and rejects failures', async () => {
  const signal = new AbortController().signal;
  assert.equal(
    await acceptanceCommand(node, ['-e', 'process.stdout.write("ready")'], {}, signal),
    'ready',
  );
  await assert.rejects(
    acceptanceCommand(node, ['-e', 'process.stderr.write("failure"); process.exit(7)'], {}, signal),
    /exited 7\nfailure/,
  );
});

test('acceptance cancellation stops an owned descendant before returning', async () => {
  const controller = new AbortController();
  let descendant;
  const script = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); process.stdout.write(String(child.pid)); setInterval(()=>{},1000);`;
  await assert.rejects(
    acceptanceCommand(
      node,
      ['-e', script],
      {
        onOutput(chunk) {
          descendant = Number(String(chunk));
          controller.abort(new Error('acceptance interrupted'));
        },
      },
      controller.signal,
    ),
    /acceptance interrupted/,
  );
  assert.ok(descendant > 0);
  assert.throws(() => process.kill(descendant, 0), { code: 'ESRCH' });
});

test('acceptance timeout also terminates its command', async () => {
  await assert.rejects(
    acceptanceCommand(
      node,
      ['-e', 'setInterval(()=>{},1000)'],
      { timeoutMs: 100 },
      new AbortController().signal,
    ),
    /timed out/,
  );
});
