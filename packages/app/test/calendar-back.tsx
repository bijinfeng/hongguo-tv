import { expect, open, test } from 'nsh/test';

/** Back ownership is checked without a media/native host or real content requests. */
export function registerCalendarBackTests(entry = './CalendarBackStatePreview.tsx') {
  test('calendar back closes the page announcement before leaving the root section', async () => {
    const app = await open(entry);
    await app.press('进入日历');
    await app.press('返回');
    await app.waitFor('text:announcement:closed');
    expect(app.shows('text:section:calendar')).toBe(true);
    expect(app.shows('text:depth:1')).toBe(true);
    expect(app.shows('text:calls:1 · closed:1')).toBe(true);
    await app.press('返回');
    await app.waitFor('text:section:home');
    expect(app.shows('text:calls:2 · closed:1')).toBe(true);
    app.dispose();
  });
  test('native back consumes only an open active calendar layer', async () => {
    const app = await open(entry);
    await app.press('原生返回层');
    await app.waitFor('text:native-consumed:false');
    expect(app.shows('text:calls:0 · closed:0')).toBe(true);
    await app.press('进入日历');
    await app.press('原生返回层');
    await app.waitFor('text:native-consumed:true');
    expect(app.shows('text:section:calendar')).toBe(true);
    expect(app.shows('text:announcement:closed')).toBe(true);
    await app.press('原生返回层');
    await app.waitFor('text:native-consumed:false');
    expect(app.shows('text:section:calendar')).toBe(true);
    app.dispose();
  });
  test('a covered calendar cannot dismiss its announcement before the detail route returns', async () => {
    const app = await open(entry);
    await app.press('进入日历');
    await app.press('打开详情');
    await app.waitFor('text:depth:2');
    await app.press('原生返回层');
    await app.waitFor('text:native-consumed:false');
    await app.press('返回');
    await app.waitFor('text:depth:1');
    expect(app.shows('text:announcement:open')).toBe(true);
    expect(app.shows('text:calls:0 · closed:0')).toBe(true);
    await app.press('返回');
    await app.waitFor('text:announcement:closed');
    expect(app.shows('text:section:calendar')).toBe(true);
    app.dispose();
  });
  test('stale calendar unregister preserves its replacement and current unregister releases ownership', async () => {
    const app = await open(entry);
    await app.press('进入日历');
    await app.press('替换并注销旧处理器');
    await app.press('返回');
    await app.waitFor('text:announcement:closed');
    expect(app.shows('text:section:calendar')).toBe(true);
    await app.press('展开公告');
    await app.press('注销返回处理器');
    await app.press('返回');
    await app.waitFor('text:section:home');
    expect(app.shows('text:announcement:open')).toBe(true);
    expect(app.shows('text:calls:1 · closed:1')).toBe(true);
    app.dispose();
  });
}
