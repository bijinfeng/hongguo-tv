import { expect, open, test } from 'nsh/test';

export function registerNotificationsStateTests(entry: string) {
  const start = () =>
    open(entry, { width: 1440, height: 1080, platform: 'macos', clock: {}, reducedMotion: true });

  test('first notification read establishes a baseline and publishes a real unread count', async () => {
    const app = await start();
    await app.waitFor('text:reads:1');
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'a'.repeat(32));
    expect(app.shows('text:unread:1')).toBe(true);
    expect(app.shows('text:row:unread')).toBe(true);
  });

  test('single and all read use explicit writes and publish the returned snapshot', async () => {
    const app = await start();
    await app.press('完成读取');
    await app.waitFor('text:row:unread');
    await app.press('标为已读');
    await app.waitFor('text:mutation:pending');
    expect(app.shows('text:writes:follow:9007199254740993:2')).toBe(true);
    await app.press('完成已读写入');
    await app.waitFor('text:row:read');
    expect(app.shows('text:unread:0')).toBe(true);
    await app.press('全部已读');
    await app.waitFor('text:mutation:pending');
    expect(app.shows('text:writes:follow:9007199254740993:2,all')).toBe(true);
    await app.press('完成已读写入');
    await app.waitFor('text:mutation:none');
  });

  test('lost read response becomes unknown and explicit recovery reads without reposting', async () => {
    const app = await start();
    await app.press('完成读取');
    await app.press('标为已读');
    await app.press('丢失已读响应');
    await app.waitFor('text:mutation:unknown');
    expect(app.shows('text:writes:follow:9007199254740993:2')).toBe(true);
    await app.wait(500);
    expect(app.shows('text:writes:follow:9007199254740993:2')).toBe(true);
    await app.press('重试');
    await app.waitFor('text:reads:2');
    await app.press('完成读取');
    await app.waitFor('text:mutation:none');
    expect(app.shows('text:writes:follow:9007199254740993:2')).toBe(true);
  });

  test('owner changes clear old rows and read only the new scope', async () => {
    const app = await start();
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'a'.repeat(32));
    await app.press('切换账号代次');
    await app.waitFor('text:reads:2');
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'b'.repeat(32));
    expect(app.shows('text:writes:none')).toBe(true);
  });

  test('owner changes fence a pending read result before it can publish', async () => {
    const app = await start();
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'a'.repeat(32));
    await app.press('标为已读');
    await app.waitFor('text:mutation:pending');
    await app.press('切换账号代次');
    await app.waitFor('text:reads:2');
    await app.press('完成已读写入');
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'b'.repeat(32));
  });

  test('background cancels the read and stale refresh keeps the prior snapshot', async () => {
    const app = await start();
    await app.press('完成读取');
    await app.waitFor('text:snapshot:' + 'a'.repeat(32));
    await app.press('后台');
    await app.press('刷新');
    expect(app.shows('text:reads:1')).toBe(true);
    await app.press('恢复');
    await app.waitFor('text:reads:2');
    await app.press('读取失败');
    await app.press('完成读取');
    await app.waitFor('text:stale:true');
    expect(app.shows('text:snapshot:' + 'a'.repeat(32))).toBe(true);
    expect(app.shows('text:row:unread')).toBe(true);
    await app.press('读取恢复');
  });
}
