import { expect, test } from 'nsh/test';
import {
  CoreError,
  configureClient,
  configureTransport,
  mediaURL,
  play,
  request,
} from '@hongguo/core-client';
import { createNativeTransport, type NativeCall } from '@hongguo/core-client/native';
import { isPlaybackCommand, playbackLease, progressSession } from '../src/playback';

export function registerPlaybackTests() {
  test('native transport preserves errors and cancels an unaccepted late media result', async () => {
    let resolve: (reply: string) => void = () => {};
    const events: string[] = [];
    const adapter = createNativeTransport({
      origin: () => 'http://127.0.0.1:8765',
      start(path, body) {
        events.push(path, body ?? 'GET');
        return {
          result: () =>
            new Promise((done) => {
              resolve = done;
            }),
          accept: () => events.push('accept'),
          cancel: () => events.push('cancel'),
          dispose: () => events.push('dispose'),
        } satisfies NativeCall;
      },
      close: () => events.push('close'),
      dispose: () => events.push('session-dispose'),
    });
    configureTransport(adapter);
    const abort = new AbortController();
    const pending = request('/api/v1/play/info', abort.signal).catch((error) => error);
    abort.abort();
    resolve(
      JSON.stringify({
        status: 200,
        body: { ok: true, data: { path: '/minireel-proxy/media/' + 'a'.repeat(64) } },
      }),
    );
    const cancelled = await pending;
    expect(cancelled instanceof CoreError).toBe(true);
    if (!(cancelled instanceof CoreError)) throw new Error('Expected cancellation');
    expect(cancelled.code).toBe('CORE_CANCELLED');
    expect(events.includes('accept')).toBe(false);
    expect(events.at(-1)).toBe('dispose');

    const failed = request('/api/v1/account').catch((error) => error);
    resolve(
      JSON.stringify({
        status: 501,
        body: { ok: false, code: 'CORE_NOT_IMPLEMENTED', error: '此功能尚未开放' },
      }),
    );
    const error = await failed;
    if (!(error instanceof CoreError)) throw new Error('Expected unavailable error');
    expect(error.code).toBe('CORE_NOT_IMPLEMENTED');
    expect(error.status).toBe(501);
    const succeeded = request<{ entries: unknown[] }>('/api/v1/library', undefined, {
      action: 'clear',
      kind: 'history',
    });
    resolve(JSON.stringify({ status: 200, body: { ok: true, data: { entries: [] } } }));
    expect(await succeeded).toEqual({ entries: [] });
    expect(events.includes('accept')).toBe(true);
    const accepted = events.filter((event) => event === 'accept').length;
    const malformed = request('/api/v1/status').catch((error) => error);
    resolve(JSON.stringify({ body: { ok: true } }));
    const invalid = await malformed;
    if (!(invalid instanceof CoreError)) throw new Error('Expected invalid response');
    expect(invalid.code).toBe('CORE_RESPONSE_INVALID');
    expect(events.filter((event) => event === 'accept').length).toBe(accepted);
    const before = events.length;
    await request('/api/v1/search', abort.signal).catch(() => {});
    expect(events.length).toBe(before);
    adapter.close();
    adapter.close();
    expect(events.filter((event) => event === 'close').length).toBe(1);
    const closed = await request('/api/v1/library').catch((error) => error);
    if (!(closed instanceof CoreError)) throw new Error('Expected closed error');
    expect(closed.code).toBe('CORE_CLOSED');
    configureClient('http://127.0.0.1:8765');
  });
  test('playback resolves its media origin from the transport that prepared it', async () => {
    let done: (reply: unknown) => void = () => {};
    const released: unknown[] = [];
    configureTransport({
      mediaOrigin: 'http://127.0.0.1:8765',
      request: (path, _, body) => {
        if (path === '/api/v1/play/release') {
          released.push(body);
          return Promise.resolve({ released: true });
        }
        return new Promise((resolve) => {
          done = resolve;
        });
      },
    });
    const pending = play(
      { series_id: '123', title: '', intro: '', cover: '' },
      { index: 1, video_id: '456', locked: false },
      new AbortController().signal,
    );
    configureClient('http://127.0.0.1:9999');
    done({ path: '/minireel-proxy/media/' + 'a'.repeat(64), vid: '456' });
    const media = await pending;
    expect(media.url.startsWith('http://127.0.0.1:8765/')).toBe(true);
    await media.release();
    expect(released).toEqual([{ path: '/minireel-proxy/media/' + 'a'.repeat(64) }]);
    configureTransport({
      mediaOrigin: 'http://127.0.0.1:8765',
      request: (path, _, body) => {
        if (path === '/api/v1/play/release') {
          released.push(body);
          return Promise.resolve({ released: true });
        }
        return Promise.resolve({ path: '/minireel-proxy/media/' + 'b'.repeat(64), vid: 'wrong' });
      },
    });
    const rejected = play(
      { series_id: '123', title: '', intro: '', cover: '' },
      { index: 1, video_id: '456', locked: false },
      new AbortController().signal,
    ).catch((error) => error);
    configureClient('http://127.0.0.1:9999');
    const error = await rejected;
    if (!(error instanceof CoreError)) throw new Error('Expected identity rejection');
    expect(error.code).toBe('PLAYBACK_IDENTITY_MISMATCH');
    expect(released.at(-1)).toEqual({ path: '/minireel-proxy/media/' + 'b'.repeat(64) });
    const count = released.length;
    configureTransport({
      mediaOrigin: 'http://127.0.0.1:8765',
      request: (path, _, body) => {
        if (path === '/api/v1/play/release') released.push(body);
        return Promise.resolve({ path: 'https://foreign.test/media', vid: '456' });
      },
    });
    const invalid = await play(
      { series_id: '123', title: '', intro: '', cover: '' },
      { index: 1, video_id: '456', locked: false },
      new AbortController().signal,
    ).catch((reason) => reason);
    expect(invalid instanceof Error).toBe(true);
    expect(released.length).toBe(count);
    configureClient('http://127.0.0.1:8765');
  });
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
