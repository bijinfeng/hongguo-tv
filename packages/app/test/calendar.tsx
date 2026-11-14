import { expect, open, test } from 'nsh/test';

export function registerCalendarTests(entry = './CalendarStatePreview.tsx') {
  test('a visible inactive calendar keeps its read while background cancels it', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.setLifecycle('inactive');
    await app.press('完成首屏');
    await app.waitFor('text:ids:released-1,released-2,upcoming-1');
    expect(app.texts().some((text) => text.includes('abort1'))).toBe(false);
    await app.press('追加日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read2:')));
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort2')));
    app.dispose();
  });
  test('default calendar without a confirmed date fails before caching and retries the first intent', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.press('完成无日期');
    await app.waitFor('text:calendar-error');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('重试日历');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read2:/api/v1/lists/calendar')),
    );
    expect(app.texts().some((text) => text.includes('date='))).toBe(false);
    await app.press('完成当前');
    await app.waitFor('text:effective:20261114');
  });
  test('calendar preserves independent cursors, typed identities and exact retry paths', async () => {
    const app = await open(entry);
    await app.press('验证真实日期');
    await app.waitFor('text:dates-valid');
    await app.press('激活日历');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read1:/api/v1/lists/calendar')),
    );
    expect(app.texts().some((text) => text.includes('subscribe_offset='))).toBe(false);
    await app.press('完成首屏');
    await app.waitFor('text:ids:released-1,released-2,upcoming-1');
    await app.press('追加日历');
    await app.waitUntil(() =>
      app
        .texts()
        .some((text) =>
          text.includes(
            'read2:/api/v1/lists/calendar?date=20261114&offset=45&session_id=fixture-session',
          ),
        ),
    );
    await app.press('完成阶段切换');
    await app.waitFor('text:cursor:24:23');
    await app.waitFor('text:ids:released-1,released-2,upcoming-1,upcoming-3');
    await app.press('追加日历');
    await app.waitUntil(() =>
      app
        .texts()
        .some((text) =>
          text.includes(
            'read3:/api/v1/lists/calendar?date=20261114&subscribe_offset=23&offset=24&session_id=fixture-session',
          ),
        ),
    );
    await app.press('失败当前');
    await app.waitFor('text:calendar-error');
    expect(app.shows('text:ids:released-1,released-2,upcoming-1,upcoming-3')).toBe(true);
    await app.press('重试日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read4:')));
    const events = app.texts().find((text) => text.includes('read4:'))!;
    expect(events.match(/read3:([^|]+)/)?.[1]).toBe(events.match(/read4:([^|]+)/)?.[1]);
    await app.press('完成空页');
    await app.waitFor('text:cursor:60:23');
    expect(app.shows('text:ids:released-1,released-2,upcoming-1,upcoming-3')).toBe(true);
  });
  test('calendar caches completed modes and dates while replacing pending selection work', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.press('完成首屏');
    await app.waitFor('text:dates:20261114,20261115');
    await app.press('拒绝虚构日期');
    expect(app.shows('text:selection:calendar:')).toBe(true);
    await app.press('追加日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read2:')));
    await app.press('选择明天');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort2')));
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read3:/api/v1/lists/calendar?date=20261115')),
    );
    await app.press('完成旧续页');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('完成当前');
    await app.waitFor('text:ids:released-1,released-2,upcoming-1');
    await app.press('选择今天');
    await app.waitFor('text:selection:calendar:');
    expect(app.shows('text:ids:released-1,released-2,upcoming-1')).toBe(true);
    expect(app.texts().some((text) => text.includes('read4:'))).toBe(false);
    await app.press('选择明天');
    await app.waitFor('text:selection:calendar:20261115');
    await app.press('新剧模式');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read4:/api/v1/lists/new?gender=2')),
    );
    await app.press('完成当前');
    await app.waitFor('text:ids:released-10');
    await app.press('日历模式');
    await app.waitFor('text:selection:calendar:20261115');
    expect(app.shows('text:ids:released-1,released-2,upcoming-1')).toBe(true);
    await app.press('新剧模式');
    await app.waitFor('text:ids:released-10');
    expect(app.texts().some((text) => text.includes('read5:'))).toBe(false);
    await app.press('选择男生');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read5:/api/v1/lists/new?gender=1')),
    );
  });
  test('calendar hidden, background and disposed ownership rejects late completion', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.press('隐藏日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort1')));
    await app.press('完成首屏');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read2:')));
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort2')));
    await app.press('完成当前');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.setLifecycle('active');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read3:')));
    await app.press('移除日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort3')));
    await app.press('完成当前');
    expect(app.shows('id:calendar-owner')).toBe(false);
  });
  test('calendar rejects invalid schema or continuing stalled cursor and does not auto-retry errors', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.press('完成坏日期');
    await app.waitFor('text:calendar-error');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('隐藏日历');
    await app.press('激活日历');
    await app.waitFor('text:calendar-error');
    expect(app.texts().some((text) => text.includes('read2:'))).toBe(false);
    await app.press('重试日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read2:')));
    await app.press('完成坏游标');
    await app.waitFor('text:calendar-error');
    await app.press('重试日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read3:')));
    await app.press('完成末页');
    await app.waitFor('text:ids:released-1,released-2,upcoming-1');
    await app.press('追加日历');
    expect(app.texts().some((text) => text.includes('read4:'))).toBe(false);
  });
  test('calendar pins the accepted default day and retains completed work across visibility and lifecycle', async () => {
    const app = await open(entry);
    await app.press('激活日历');
    await app.waitUntil(() => app.texts().some((text) => text.includes('read1:')));
    await app.press('完成首屏');
    await app.waitFor('text:effective:20261114');
    await app.press('追加日历');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read2:/api/v1/lists/calendar?date=20261114&')),
    );
    await app.press('完成跨日页');
    await app.waitFor('text:cursor:60:-');
    expect(app.shows('text:effective:20261114')).toBe(true);
    await app.press('隐藏日历');
    await app.press('激活日历');
    await app.setLifecycle('background');
    await app.setLifecycle('active');
    expect(app.shows('text:ids:released-1,released-2,upcoming-1')).toBe(true);
    expect(app.texts().some((text) => text.includes('read3:'))).toBe(false);
    await app.press('追加日历');
    await app.waitUntil(() =>
      app.texts().some((text) => text.includes('read3:/api/v1/lists/calendar?date=20261114&')),
    );
  });
}
