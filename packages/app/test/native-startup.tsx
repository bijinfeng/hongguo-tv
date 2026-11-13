import { expect, open, test } from 'nsh/test';

export function registerNativeStartupTests() {
  test('native startup preserves failure, retries into shared UI and closes its owned session', async () => {
    const app = await open('./NativeStartupPreview.tsx', {
      host: { params: { scenario: 'failure' } },
    });
    await app.waitFor('观看记录暂时无法读取，请重试');
    expect(app.shows('id:app-desktop')).toBe(false);
    expect(app.requests().some((r) => r.url.includes('/api/v1'))).toBe(false);
    await app.press('重试');
    await app.waitFor('id:app-desktop');
    expect(app.texts().find((t) => t.includes('opened|opened'))).toBeDefined();
    expect(app.requests().some((r) => r.url.includes('/api/v1'))).toBe(false);
    await app.press('移除应用');
    await app.waitFor('id:app-desktop', { state: 'gone' });
    const events = app.texts().find((t) => t.includes('session-disposed')) || '';
    expect(events.split('closed').length - 1).toBe(1);
    expect(events.split('session-disposed').length - 1).toBe(1);
  });
  test('native open completing after removal disposes without mounting or issuing business calls', async () => {
    const app = await open('./NativeStartupPreview.tsx', {
      host: { params: { scenario: 'late' } },
    });
    await app.waitFor('正在打开…');
    await app.press('移除应用');
    await app.press('完成启动');
    await app.waitFor('opened|session-disposed');
    expect(app.shows('id:app-desktop')).toBe(false);
    expect(app.requests().some((r) => r.url.includes('/api/v1'))).toBe(false);
  });
  test('final viewing checkpoint drains behind earlier writes and keeps its original core across replacement', async () => {
    const app = await open('./NativeStartupPreview.tsx', {
      host: { params: { scenario: 'drain' } },
    });
    await app.waitFor('writing-1');
    await app.press('移除应用');
    expect(app.shows('正在观看')).toBe(false);
    expect(app.texts().some((t) => t.includes('closed'))).toBe(false);
    await app.press('完成写入');
    await app.waitFor('writing-1|committed-1|writing-5');
    expect(app.texts().some((t) => t.includes('closed'))).toBe(false);
    await app.press('完成写入');
    await app.waitFor('writing-1|committed-1|writing-5|committed-5|closed');
    expect(app.texts().some((t) => t.includes('foreign'))).toBe(false);
  });
  test('HTTP preview is explicit and invalid modes never open native core or silently fall back', async () => {
    const preview = await open('./NativeStartupPreview.tsx', {
      host: { params: { scenario: 'http-preview' } },
      network: { '*': { body: { ok: true, data: { entries: [], owner_id: '' } } } },
    });
    await preview.waitFor('id:app-desktop');
    expect(preview.requests().some((r) => r.url.includes('/api/v1/library'))).toBe(true);
    expect(preview.shows('none')).toBe(true);
    const invalid = await open('./NativeStartupPreview.tsx', {
      host: { params: { scenario: 'invalid' } },
    });
    await invalid.waitFor('应用配置不可用，请重新安装或联系维护者');
    expect(invalid.shows('id:app-desktop')).toBe(false);
    expect(invalid.shows('none')).toBe(true);
    expect(invalid.requests().some((r) => r.url.includes('/api/v1'))).toBe(false);
  });
}
