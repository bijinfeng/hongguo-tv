import { host, mount } from 'nsh';
import { NativeCore, BridgeFixture } from 'hongguo-test/native';

mount(() => null);
const expect = (value, message) => {
  if (!value) throw new Error(message);
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
async function response(call) {
  return JSON.parse(await call.result());
}
async function request(session, path, body = null) {
  const call = session.start(path, body);
  try {
    const value = await response(call);
    call.accept();
    return value;
  } finally {
    call.dispose();
  }
}
async function disposed(value, method) {
  let rejected = false;
  try {
    await method(value);
  } catch (error) {
    rejected = String(error).includes('disposed');
  }
  expect(rejected, 'disposed native class must reject use');
}
async function main() {
  const { scenario, origin } = host.params;
  if (scenario === 'no-directory' || scenario === 'bad-database') {
    let failure = '';
    try {
      const unexpected = await NativeCore.open();
      unexpected.dispose();
    } catch (error) {
      failure = String(error);
    }
    expect(
      failure.includes(
        scenario === 'no-directory' ? 'NATIVE_DATA_UNAVAILABLE' : 'LIBRARY_STORAGE_UNAVAILABLE',
      ),
      'native init must fail explicitly',
    );
    return;
  }
  if (scenario === 'library') {
    const session = await NativeCore.open();
    expect(/^http:\/\/127\.0\.0\.1:\d+$/.test(session.origin()), 'native media must use loopback');
    const status = await request(session, '/api/v1/status');
    expect(status.body.data.capabilities.history, 'native history capability');
    expect(status.body.data.capabilities.playback, 'native playback capability');
    const saved = await request(
      session,
      '/api/v1/library',
      JSON.stringify({
        action: 'progress',
        drama: { series_id: '11', title: '合成短剧', cover: '', intro: '' },
        episode: 1,
        video_id: '22',
        position: 12.5,
        duration: 30,
      }),
    );
    expect(saved.body.data.entries[0].position === 12.5, 'mixed history save');
    expect(
      (await request(session, '/api/v1/account')).body.code === 'CORE_NOT_IMPLEMENTED',
      'account remains unavailable',
    );
    session.close();
    session.close();
    session.dispose();
    await disposed(session, (value) => value.origin());
    const reopened = await NativeCore.open();
    expect(
      (await request(reopened, '/api/v1/library')).body.data.entries[0].position === 12.5,
      'mixed native reopen',
    );
    reopened.dispose();
    return;
  }
  const session = await BridgeFixture.open(origin);
  if (scenario === 'pending') {
    const cancelled = session.start('/api/v1/search?q=slow', null);
    const cancelledAnswer = response(cancelled);
    await settle();
    cancelled.cancel();
    expect((await cancelledAnswer).status === 499, 'pending native cancellation');
    cancelled.dispose();
    const released = session.start('/api/v1/search?q=slow', null);
    const releasedAnswer = response(released);
    await settle();
    released.dispose();
    expect((await releasedAnswer).status === 499, 'dispose alone must settle pending result');
    await disposed(released, (value) => value.accept());
    const closing = session.start('/api/v1/search?q=slow', null);
    const closingAnswer = response(closing);
    await settle();
    session.dispose();
    expect((await closingAnswer).status === 499, 'session dispose must settle pending result');
    closing.dispose();
    await disposed(session, (value) => value.origin());
    return;
  }
  const first = session.start('/api/v1/play/info?series_id=11&vid=22&mode=range', null);
  const path = (await response(first)).body.data.path;
  expect(BridgeFixture.hasMedia(session, path), 'ready media must exist');
  first.dispose();
  expect(!BridgeFixture.hasMedia(session, path), 'unaccepted result dispose must release media');
  const second = session.start('/api/v1/play/info?series_id=11&vid=22&mode=range', null);
  const acceptedPath = (await response(second)).body.data.path;
  second.accept();
  second.dispose();
  expect(BridgeFixture.hasMedia(session, acceptedPath), 'accepted media must survive call dispose');
  session.close();
  session.close();
  expect(
    !BridgeFixture.hasMedia(session, acceptedPath),
    'session close must release accepted media',
  );
  expect(
    (await request(session, '/api/v1/status')).body.code === 'CORE_CLOSED',
    'closed session rejects new calls',
  );
  session.dispose();
}
setTimeout(() => {
  void main().then(
    () => host.post('result', { ok: true }),
    (error) => host.post('result', { ok: false, error: String(error), stack: error?.stack }),
  );
}, 0);
