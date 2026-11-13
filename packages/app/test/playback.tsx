import { expect, test } from 'nsh/test';
import { configureClient, mediaURL } from '@hongguo/core-client';
import { progressSession } from '../src/playback';

export function registerPlaybackTests() {
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
    session.save();
    expect(writes.length).toBe(3);
    expect(writes[2].completed).toBe(true);
  });
}
