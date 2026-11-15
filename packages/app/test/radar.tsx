import { expect, open, test, type App } from 'nsh/test';
import { compareRadarInteger, radarInteger, radarRate } from '../src/radar';

const read = (app: App, task: number) =>
  app.waitUntil(() => app.texts().some((text) => text.includes(`read${task}:`)));
const has = (app: App, text: string) => app.texts().some((value) => value.includes(text));
async function loaded() {
  const app = await open('./RadarStatePreview.tsx');
  expect(has(app, 'read1:')).toBe(false);
  await app.press('激活雷达');
  await read(app, 1);
  expect(has(app, 'read1:/api/v1/radar')).toBe(true);
  await app.press('完成当前');
  await app.waitFor('text:rows:101,102,201');
  return app;
}

export function registerRadarTests() {
  test('radar decimal formatting and comparison preserve i64 precision, signs, zero and missing values', () => {
    expect(compareRadarInteger('9007199254740993', '9007199254740992') > 0).toBe(true);
    expect(compareRadarInteger('-9223372036854775808', '-9007199254740993') < 0).toBe(true);
    expect(compareRadarInteger('-0', '0')).toBe(0);
    expect(radarInteger('9223372036854775807')).toBe('9,223,372,036,854,775,807');
    expect(radarInteger('-1200', true)).toBe('−1,200');
    expect(radarInteger('0', true)).toBe('0');
    expect(radarInteger('1200', true)).toBe('+1,200');
    expect(radarInteger(null)).toBe('—');
    expect(radarRate(Number.MAX_VALUE)).toBe('1.7976931348623157e+310%');
    expect(radarRate(-Number.MAX_VALUE)).toBe('-1.7976931348623157e+310%');
    expect(radarRate(0)).toBe('0%');
  });
  test('radar equal growth metrics retain the source order after sorting', async () => {
    const app = await loaded();
    await app.press('刷新雷达');
    await read(app, 2);
    await app.press('完成相等指标');
    await app.press('增长视图');
    await app.waitFor('text:rows:101,102,201');
    app.dispose();
  });
  test('radar keeps snapshot ranks, exact joins and independent dates while sorting source increments precisely', async () => {
    const app = await loaded();
    expect(has(app, '"rank":"9"')).toBe(true);
    expect(has(app, '"streak":"0天"')).toBe(true);
    expect(has(app, '"rank":"—"')).toBe(true);
    expect(has(app, '"hot":"9,223,372,036,854,775,807"')).toBe(true);
    expect(has(app, 'dates:2026-11-13:2026-11-14')).toBe(true);
    await app.press('增长视图');
    await app.waitFor('text:rows:102,101,201');
    await app.press('按收藏增量');
    await app.waitFor('text:rows:101,102,201');
    await app.press('按增长率');
    expect(has(app, 'rows:101,102,201')).toBe(true);
    expect(has(app, '"r_hot":"-3%"')).toBe(true);
    await app.press('未知类型');
    await app.waitFor('text:rows:201');
    expect(has(app, 'read2:')).toBe(false);
    app.dispose();
  });
  test('radar partial refresh retains previous growth and an unsuccessful refresh keeps visible rows', async () => {
    const app = await loaded();
    await app.press('刷新雷达');
    await read(app, 2);
    await app.press('完成部分');
    await app.waitFor('text:growth-stale:true');
    expect(has(app, '"hot":"9,223,372,036,854,775,807"')).toBe(true);
    await app.press('刷新雷达');
    await read(app, 3);
    await app.press('失败当前');
    await app.waitFor('雷达读取失败，请重试');
    expect(has(app, 'rows:101,102,201')).toBe(true);
    expect(has(app, 'secret-token')).toBe(false);
    app.dispose();
  });
  test('radar hidden and background reads abort and ignore transports that resolve after cancellation', async () => {
    const app = await open('./RadarStatePreview.tsx');
    await app.press('激活雷达');
    await read(app, 1);
    await app.press('隐藏雷达');
    await app.waitUntil(() => has(app, 'abort1'));
    await app.press('完成旧请求');
    expect(has(app, 'rows:101')).toBe(false);
    await app.press('激活雷达');
    await read(app, 2);
    await app.setLifecycle('background');
    await app.waitUntil(() => has(app, 'abort2'));
    await app.press('完成当前');
    expect(has(app, 'rows:101')).toBe(false);
    app.dispose();
  });
  test('radar detail requests require the exact ID and reject mismatches before allowing a retry', async () => {
    const app = await loaded();
    await app.press('打开未知ID');
    expect(has(app, 'read2:')).toBe(false);
    await app.press('打开101');
    await read(app, 2);
    expect(has(app, 'read2:/api/v1/series/detail?series_id=101&content_type=')).toBe(true);
    await app.press('完成错误详情');
    await app.waitFor('详情读取失败，请重试');
    expect(has(app, 'opened:')).toBe(false);
    await app.press('打开101');
    await read(app, 3);
    await app.press('完成当前');
    await app.waitUntil(() => has(app, 'opened:101'));
    app.dispose();
  });
  test('radar a newer row, filter, input intent or unmount rejects late detail navigation', async () => {
    const app = await loaded();
    await app.press('打开101');
    await read(app, 2);
    await app.press('打开102');
    await read(app, 3);
    await app.press('完成旧详情');
    expect(has(app, 'opened:101')).toBe(false);
    await app.press('较新意图');
    await app.press('完成当前');
    expect(has(app, 'opened:102')).toBe(false);
    await app.press('打开101');
    await read(app, 4);
    await app.press('增长视图');
    await app.waitUntil(() => has(app, 'abort4'));
    await app.press('完成当前');
    expect(has(app, 'opened:')).toBe(false);
    await app.press('打开102');
    await read(app, 5);
    await app.press('卸载雷达');
    await app.waitUntil(() => has(app, 'abort5'));
    await app.press('完成当前');
    expect(has(app, 'opened:')).toBe(false);
    app.dispose();
  });
}
