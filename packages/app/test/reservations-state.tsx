import { expect, open, test } from 'nsh/test';

export function registerReservationStateTests(entry: string) {
  const start = () =>
    open(entry, { width: 1440, height: 1080, platform: 'macos', clock: {}, reducedMotion: true });
  test('reservation state fences old epoch reads and never infers item identity from a series', async () => {
    const app = await start();
    await app.waitFor('text:reads:1');
    await app.press('切换账号代次');
    await app.waitFor('text:reads:2');
    await app.press('完成最早读取');
    await app.wait(30);
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('完成最新读取');
    await app.waitFor(`text:snapshot:${'b'.repeat(32)}`);
    expect(app.shows('text:item:true')).toBe(true);
    expect(app.shows('text:series:false')).toBe(true);
    await app.press('缺少关联身份');
    await app.press('刷新');
    await app.press('完成最早读取');
    await app.waitFor('text:series:undefined');
    await app.press('预约季');
    await app.waitFor('text:writes:series:9007199254740995:true');
    await app.press('完成确认写入');
    await app.waitFor('text:series:true');
  });
  test('lost reservation reply recovers by reading and explicit retry keeps the original absolute target', async () => {
    const app = await start();
    await app.waitFor('text:reads:1');
    await app.press('完成最早读取');
    await app.waitFor('text:item:true');
    await app.press('取消项目');
    await app.press('预约季');
    expect(app.shows('text:writes:item:9007199254740995:false')).toBe(true);
    await app.press('丢失响应');
    await app.waitFor('text:reads:2');
    await app.press('已上线');
    await app.press('完成最早读取');
    await app.waitFor('text:mutation:unknown');
    expect(app.shows('text:item:true')).toBe(true);
    await app.wait(500);
    expect(app.shows('text:writes:item:9007199254740995:false')).toBe(true);
    await app.press('重试');
    await app.waitFor('text:reads:3');
    await app.press('完成最早读取');
    await app.waitFor('text:writes:item:9007199254740995:false,item:9007199254740995:false');
    await app.press('完成确认写入');
    await app.waitFor('text:item:false');
    await app.waitFor('text:mutation:none');
  });
  test('reservation background invalidates a pending reply and foreground reconciles without another write', async () => {
    const app = await start();
    await app.waitFor('text:reads:1');
    await app.press('完成最早读取');
    await app.waitFor('text:item:true');
    await app.press('取消项目');
    await app.press('后台');
    await app.waitFor('text:mutation:unknown');
    await app.press('完成确认写入');
    await app.wait(30);
    expect(app.shows('text:stale:true')).toBe(true);
    await app.press('恢复');
    await app.waitFor('text:reads:2');
    await app.press('完成最早读取');
    await app.waitFor('text:item:false');
    await app.waitFor('text:mutation:none');
    expect(app.shows('text:writes:item:9007199254740995:false')).toBe(true);
  });
  test('reservation acknowledgement stays unconfirmed and disposal rejects late publication', async () => {
    const app = await start();
    await app.waitFor('text:reads:1');
    await app.press('完成最早读取');
    await app.waitFor('text:item:true');
    await app.press('取消项目');
    await app.press('完成未确认写入');
    await app.waitFor('text:mutation:unconfirmed');
    await app.press('刷新');
    await app.waitFor('text:reads:2');
    await app.press('销毁');
    await app.press('完成最早读取');
    await app.wait(30);
    expect(app.shows('text:stale:true')).toBe(true);
    expect(app.shows('text:writes:item:9007199254740995:false')).toBe(true);
    await app.press('刷新');
    expect(app.shows('text:reads:2')).toBe(true);
  });
}
