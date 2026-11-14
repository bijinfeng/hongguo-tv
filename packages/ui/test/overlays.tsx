import { expect, open, test, type OpenOptions } from 'nsh/test';

/** Overlay acceptance options shared by headless and visible-host runs. */
export interface OverlayTestOptions {
  /** Target density, independent of the host operating system. */
  target?: 'desktop' | 'tv';
  /** Native appearance; defaults to the light theme. */
  colorScheme?: 'light' | 'dark';
  /** Run finite transitions when false; defaults to reduced motion. */
  reducedMotion?: boolean;
}

/** Registers public-overlay interaction contracts against the component gallery. */
export function registerOverlayTests(entry: string, options: OverlayTestOptions = {}) {
  const settings = (): OpenOptions => ({
    platform: 'macos',
    width: options.target === 'tv' ? 1920 : 1440,
    height: options.target === 'tv' ? 1080 : 1000,
    colorScheme: options.colorScheme ?? 'light',
    reducedMotion: options.reducedMotion ?? true,
    clock: {},
    network: {},
  });

  test('overlay menu opens, skips disabled commands, selects once and restores its trigger', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-menu-trigger');
    await app.waitFor('id:gallery-menu-details');
    expect(app.enabled('id:gallery-menu-unavailable')).toBe(false);
    await app.keyboard.press('down');
    await app.keyboard.press('down');
    await app.keyboard.press('enter');
    await app.waitFor('text:已选择：remove');
    await app.waitFor('id:gallery-menu-remove', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-menu-details');
    await app.keyboard.press('escape');
    await app.waitFor('id:gallery-menu-details', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-menu-details');
    app.dispose();
  });

  test('overlay popover opens and escape restores the same source', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-popover-trigger');
    await app.waitFor('text:记录保存在当前设备，可随时移除。');
    await app.keyboard.press('escape');
    await app.waitFor('text:记录保存在当前设备，可随时移除。', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('text:记录保存在当前设备，可随时移除。');
    app.dispose();
  });

  test('overlay tooltip is supplemental and never replaces the TV action', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.hover('id:gallery-tooltip-trigger');
    await app.wait(600);
    if (options.target === 'tv') {
      expect(app.shows('text:关闭当前面板')).toBe(false);
    } else {
      await app.waitFor('text:关闭当前面板');
    }
    await app.press('id:gallery-tooltip-trigger');
    await app.waitFor('text:面板已关闭');
    app.dispose();
  });

  test('overlay feedback remains controlled and explicit close removes only its message', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-toast');
    await app.waitFor('id:gallery-toasts-1');
    await app.press('id:gallery-toasts-1 >> role:button[关闭提示]');
    await app.waitFor('id:gallery-toasts-1', { state: 'gone' });
    await app.press('id:gallery-toast');
    await app.waitFor('id:gallery-toasts-2');
    await app.keyboard.press('escape');
    await app.waitFor('id:gallery-toasts-2', { state: 'gone' });
    app.dispose();
  });

  test('overlay pending confirmation blocks duplicate commits and keeps cancellation available', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-open-confirm-pending');
    await app.waitFor('id:gallery-confirm-pending');
    expect(app.enabled('id:gallery-confirm-pending-confirm')).toBe(false);
    expect(app.enabled('id:gallery-confirm-pending-cancel')).toBe(true);
    await expect(app.press('id:gallery-confirm-pending-confirm')).rejects.toMatchObject({
      code: 'ERR_NSH_TEST_DISABLED',
    });
    await app.press('id:gallery-confirm-pending-cancel');
    await app.waitFor('id:gallery-confirm-pending', { state: 'gone' });
    app.dispose();
  });

  test('overlay dialog and side panel dismiss through native back and recover their source', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-open-dialog');
    await app.waitFor('id:gallery-dialog');
    await app.press('role:button[完成]');
    await app.waitFor('id:gallery-dialog', { state: 'gone' });
    await app.wait(32);
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-dialog');
    await app.keyboard.press('escape');
    await app.waitFor('id:gallery-dialog', { state: 'gone' });
    await app.press('id:gallery-open-panel');
    await app.waitFor('text:共 80 集 · 已完结');
    await app.back();
    await app.waitFor('text:共 80 集 · 已完结', { state: 'gone' });
    await app.wait(32);
    await app.keyboard.press('enter');
    await app.waitFor('text:共 80 集 · 已完结');
    await app.press('role:button[关闭]');
    await app.waitFor('text:共 80 集 · 已完结', { state: 'gone' });
    app.dispose();
  });
}
