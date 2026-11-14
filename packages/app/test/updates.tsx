import { expect, open, test } from 'nsh/test';

export function registerUpdateTests() {
  test('update preparation retries failed history writes but never overwrites a newer episode with an older failed checkpoint', async () => {
    const failed = await open('./UpdatesStatePreview.tsx', {
      host: { params: { saving: true } },
      clock: {},
    });
    await failed.press('保存第一集');
    await failed.waitUntil(() => failed.texts().some((value) => value.includes('观看进度未保存')));
    await failed.press('准备更新');
    await failed.waitFor('text:save:failed');
    await failed.press('恢复写入');
    await failed.press('准备更新');
    await failed.waitFor('text:save:prepared');
    expect(failed.shows('text:episode-1,episode-1,episode-1')).toBe(true);
    const later = await open('./UpdatesStatePreview.tsx', {
      host: { params: { saving: true } },
      clock: {},
    });
    await later.press('保存第一集');
    await later.waitUntil(() => later.texts().some((value) => value.includes('观看进度未保存')));
    await later.press('恢复写入');
    await later.press('保存第二集');
    await later.waitFor('text:episode-1,episode-2');
    await later.press('准备更新');
    await later.waitFor('text:save:prepared');
    expect(later.shows('text:episode-1,episode-2')).toBe(true);
  });
  test('updates reopen after initialization failure and never label development hosts as current', async () => {
    const failed = await open('./UpdatesStatePreview.tsx', {
      host: { params: { initializeFailure: true } },
      clock: {},
    });
    await failed.waitFor('text:phase:checkError');
    await failed.press('id:navigation-primary-update');
    await failed.waitFor('text:phase:checking');
    await failed.press('完成检查');
    await failed.waitFor('text:phase:available');
    const dev = await open('./UpdatesStatePreview.tsx', {
      host: { params: { unsupported: true } },
      clock: {},
    });
    await dev.waitFor('text:phase:manual');
    expect(dev.texts().some((value) => value.includes('check-1'))).toBe(false);
    expect(dev.shows('已是最新版本')).toBe(false);
    const staged = await open('./UpdatesStatePreview.tsx', {
      host: { params: { ready: true, installed: true } },
      clock: {},
    });
    await staged.waitFor('text:phase:ready');
    expect(staged.shows('应用已更新')).toBe(false);
  });
  test('updates serialize host operations, retain download across pages and require saved progress and actual installation', async () => {
    const app = await open('./UpdatesStatePreview.tsx', { clock: {} });
    await app.waitFor('text:phase:checking');
    await app.press('重复检查');
    expect(app.texts().some((value) => value.includes('check-2'))).toBe(false);
    await app.press('完成检查');
    await app.waitFor('text:phase:available');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:downloading');
    await app.press('重复检查');
    await app.press('切换页面');
    await app.press('下载进度');
    await app.press('完成下载');
    await app.waitFor('text:phase:ready');
    await app.press('迟到进度');
    expect(app.shows('text:bytes:512')).toBe(true);
    await app.press('切换页面');
    await app.press('重复检查');
    expect(app.texts().some((value) => value.includes('check-2'))).toBe(false);
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:saveError');
    expect(app.texts().some((value) => value.includes(',install'))).toBe(false);
    await app.press('允许保存');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:permission');
    await app.press('id:navigation-primary-update');
    await app.press('授权完成');
    await app.wait(800);
    await app.waitFor('text:phase:ready');
    await app.press('系统安装');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:installing');
    expect(app.shows('应用已更新')).toBe(false);
    await app.press('实际版本匹配');
    await app.wait(800);
    await app.waitFor('text:phase:success');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:checking');
    expect(app.texts().some((value) => value.includes('check-2'))).toBe(true);
  });
  test('updates retry failed checks, cancel partial downloads and offer manual release download', async () => {
    const app = await open('./UpdatesStatePreview.tsx', { clock: {} });
    await app.waitFor('text:phase:checking');
    await app.press('检查失败');
    await app.waitFor('text:phase:checkError');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:checking');
    await app.press('完成检查');
    await app.waitFor('text:phase:available');
    await app.press('id:navigation-primary-update');
    await app.waitFor('text:phase:downloading');
    await app.press('取消下载');
    await app.waitFor('text:phase:available');
    await app.press('迟到进度');
    expect(app.shows('text:bytes:0')).toBe(true);
    await app.press('重复检查');
    await app.waitFor('text:phase:checking');
    await app.press('手动更新');
    await app.waitFor('text:phase:manual');
    await app.press('id:navigation-primary-update');
    await app.waitUntil(() => app.texts().some((value) => value.includes('release')));
    const corrupt = await open('./UpdatesStatePreview.tsx', {
      host: { params: { ready: true, installFailure: true } },
      clock: {},
    });
    await corrupt.waitFor('text:phase:ready');
    await corrupt.press('允许保存');
    await corrupt.press('id:navigation-primary-update');
    await corrupt.waitFor('text:phase:installError');
    await corrupt.press('重新下载');
    await corrupt.waitFor('text:phase:downloading');
    await corrupt.press('完成下载');
    await corrupt.waitFor('text:phase:ready');
  });
}
