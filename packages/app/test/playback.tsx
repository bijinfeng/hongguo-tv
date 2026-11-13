import { expect, test } from 'nsh/test';
import { configureClient, mediaURL } from '@hongguo/core-client';
import { isPlaybackCommand, playbackLease, progressSession } from '../src/playback';

export function registerPlaybackTests() {
  test('host playback commands reject unknown and structured payloads', () => {
    for (const command of [
      'reveal',
      'preview-back',
      'preview-forward',
      'confirm',
      'toggle',
      'play',
      'pause',
      'next',
      'seek-back',
      'seek-forward',
    ])
      expect(isPlaybackCommand(command)).toBe(true);
    for (const command of [null, undefined, 1, {}, { command: 'play' }, 'PLAY', '', 'open-url'])
      expect(isPlaybackCommand(command)).toBe(false);
  });
  test('media paths retain same-origin boundaries and explicit legacy compatibility', () => {
    configureClient('http://127.0.0.1:8765');
    for (const token of ['a'.repeat(64), 'b'.repeat(24) + '.mp4']) {
      const path = '/minireel-proxy/media/' + token;
      expect(mediaURL(path)).toBe('http://127.0.0.1:8765' + path);
    }
    for (const path of [
      'https://evil.test/video',
      '//evil.test/video',
      '/minireel-proxy/media/../history',
      '/minireel-proxy/media/' + 'a'.repeat(64) + '?url=secret',
      '/minireel-proxy/media/test.mp4',
    ]) {
      let rejected = false;
      try {
        mediaURL(path);
      } catch {
        rejected = true;
      }
      expect(rejected).toBe(true);
    }
  });
  test('progress saves only played content and completion survives cleanup', () => {
    const writes: { position: number; completed: boolean }[] = [];
    const session = progressSession((position, _, completed) =>
      writes.push({ position, completed }),
    );
    session.save();
    session.update(0, 60, true);
    session.save();
    expect(writes.length).toBe(0);
    session.update(15, 60, true);
    session.update(20, 60, true);
    session.save();
    expect(writes.length).toBe(2);
    session.end();
    session.update(3, 60, true);
    session.seed(4, 60);
    session.save();
    expect(writes.length).toBe(3);
    expect(writes[2].completed).toBe(true);
    expect(writes[2].position).toBe(20);
    session.restart();
    session.update(1, 60, true);
    session.save();
    expect(writes.at(-1)).toEqual({ position: 1, completed: false });
  });
  test('resume and paused seek alone never count as viewing', () => {
    const writes: number[] = [];
    const session = progressSession((position) => writes.push(position));
    session.seed(30, 60);
    session.update(30, 60, true);
    session.seed(45, 60);
    session.update(45, 60, false);
    session.save();
    expect(writes).toEqual([]);
    session.update(46, 60, true);
    session.save();
    expect(writes).toEqual([46]);
  });
  test('only the latest representation owns callbacks; late results and disposed resources release once', async () => {
    const releases: string[] = [];
    const accepted: { value: string; revision: number }[] = [];
    const errors: unknown[] = [];
    const lease = playbackLease<string>({
      pending() {},
      ready: (value, revision) => accepted.push({ value, revision }),
      failed: (error) => errors.push(error),
      release: (value) => releases.push(value),
    });
    let resolveOld!: (value: string) => void;
    let oldSignal!: AbortSignal;
    const old = lease.prepare((signal) => {
      oldSignal = signal;
      return new Promise((resolve) => {
        resolveOld = resolve;
      });
    });
    await lease.prepare(async () => 'new');
    expect(oldSignal.aborted).toBe(true);
    resolveOld('old');
    await old;
    expect(accepted.map((item) => item.value)).toEqual(['new']);
    expect(releases).toEqual(['old']);
    const revision = accepted[0].revision;
    expect(lease.current(revision)).toBe(true);
    lease.dispose();
    lease.dispose();
    expect(lease.current(revision)).toBe(false);
    expect(releases).toEqual(['old', 'new']);
    expect(errors).toEqual([]);
  });
  test('disposing preparation releases its late result and ignores its failure', async () => {
    const ready: string[] = [];
    const released: string[] = [];
    const errors: unknown[] = [];
    const lease = playbackLease<string>({
      pending() {},
      ready: (value) => ready.push(value),
      release: (value) => released.push(value),
      failed: (error) => errors.push(error),
    });
    let finish!: (value: string) => void;
    const pending = lease.prepare(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    lease.dispose();
    finish('late');
    await pending;
    await lease.prepare(async () => 'must not start');
    expect(ready).toEqual([]);
    expect(released).toEqual(['late']);
    expect(errors).toEqual([]);
  });
}
