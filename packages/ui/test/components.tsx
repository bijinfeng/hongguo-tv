import { expect, open, test, type OpenOptions } from 'nsh/test';

export interface ComponentTestOptions {
  artifacts?: string;
  host?: boolean | 'macos' | 'android';
  reducedMotion?: boolean;
  target?: 'desktop' | 'tv';
  /** An optional group limits screenshot acceptance; behavior tests still run. */
  screen?:
    | 'foundation'
    | 'controls'
    | 'forms'
    | 'navigation'
    | 'layers'
    | 'content'
    | 'cinema'
    | 'feedback';
}

/** Public package acceptance, against the same interactive gallery used in the native host. */
export function registerComponentTests(entry: string, options: ComponentTestOptions = {}) {
  const settings = (colorScheme: 'light' | 'dark' = 'light'): OpenOptions => ({
    platform: options.host === 'android' ? 'android' : 'macos',
    width: options.target === 'tv' ? 1920 : 1440,
    height: options.target === 'tv' ? 1080 : 1000,
    colorScheme,
    reducedMotion: options.reducedMotion ?? true,
    clock: {},
    network: {},
  });
  test('controlled input and search retain their value, selection controls report changes', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-forms');
    if (options.target === 'tv') {
      await app.press('id:gallery-query-activate');
    }
    await app.type('id:gallery-query', '春山');
    if (options.host && options.artifacts)
      await app.screenshot(`${options.artifacts}/input-editing.png`);
    expect(app.value('id:gallery-query')).toBe('春山');
    if (options.target === 'tv') await app.keyboard.press('escape');
    await app.press('id:gallery-query-submit');
    await app.waitFor('text:搜索：春山');
    await app.press('id:gallery-checkbox');
    await app.press('id:gallery-switch');
    await app.waitFor('text:已选择 1 项 · 自动连播关闭');
    await app.press('id:gallery-select-trigger');
    await app.keyboard.press('down');
    await app.keyboard.press('down');
    await app.keyboard.press('enter');
    await app.waitFor('text:题材：古装');
    if (options.target === 'tv') await app.press('id:gallery-query-activate');
    expect(app.value('id:gallery-query')).toBe('春山');
    app.dispose();
  });
  test('slider separates preview, confirmation and TV cancellation with source restoration', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-forms');
    await app.press('id:gallery-slider-reset');
    await app.keyboard.press('tab');
    if (options.target === 'tv') {
      await app.keyboard.press('enter');
      await app.keyboard.press('right');
      await app.waitFor('text:当前 36 · 已确认 35');
      if (options.host && options.artifacts)
        await app.screenshot(`${options.artifacts}/slider-preview.png`);
      await app.waitFor('text:调整 1 次 · 确认 0 次 · 取消 0 次');
      await app.keyboard.press('escape');
      await app.waitFor('text:当前 35 · 已确认 35');
      await app.waitFor('text:调整 2 次 · 确认 0 次 · 取消 1 次');
      await app.keyboard.press('enter');
      await app.keyboard.press('right');
      await app.waitFor('text:当前 36 · 已确认 35');
      await app.keyboard.press('enter');
      await app.waitFor('text:当前 36 · 已确认 36');
      await app.waitFor('text:调整 3 次 · 确认 1 次 · 取消 1 次');
    } else {
      await app.keyboard.press('right');
      await app.waitFor('text:当前 36 · 已确认 36');
      await app.waitFor('text:调整 1 次 · 确认 1 次 · 取消 0 次');
    }
    app.dispose();
  });
  test('pending and disabled actions cannot activate', async () => {
    const app = await open(entry, settings('dark'));
    await app.press('id:gallery-sheet-controls');
    expect(app.enabled('id:gallery-disabled')).toBe(false);
    expect(app.enabled('id:gallery-pending')).toBe(false);
    await expect(app.press('id:gallery-disabled')).rejects.toMatchObject({
      code: 'ERR_NSH_TEST_DISABLED',
    });
    await expect(app.press('id:gallery-pending')).rejects.toMatchObject({
      code: 'ERR_NSH_TEST_DISABLED',
    });
    expect(app.shows('text:不应触发')).toBe(false);
    expect(app.shows('text:处理中…')).toBe(true);
    app.dispose();
  });
  test('search pending preserves drafts, blocks submission and recovers; disabled selections cannot change', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-forms');
    if (options.target === 'tv') await app.press('id:gallery-query-activate');
    await app.type('id:gallery-query', '原搜索');
    await app.submit('id:gallery-query');
    await app.waitFor('text:搜索：原搜索');
    if (options.target === 'tv') await app.keyboard.press('escape');
    await app.press('id:gallery-query-pending');
    if (options.target === 'tv') await app.press('id:gallery-query-activate');
    await app.clear('id:gallery-query');
    await app.type('id:gallery-query', '保留草稿');
    await app.submit('id:gallery-query');
    if (options.target === 'tv') await app.keyboard.press('escape');
    expect(app.shows('text:搜索：原搜索')).toBe(true);
    expect(app.shows('text:搜索：保留草稿')).toBe(false);
    expect(app.shows('text:搜索中…')).toBe(true);
    expect(app.enabled('id:gallery-query-submit')).toBe(false);
    for (const id of [
      'gallery-disabled-unchecked',
      'gallery-disabled-checked',
      'gallery-disabled-mixed',
      'gallery-disabled-switch',
    ]) {
      expect(app.enabled(`id:${id}`)).toBe(false);
      await expect(app.press(`id:${id}`)).rejects.toMatchObject({ code: 'ERR_NSH_TEST_DISABLED' });
    }
    expect(app.shows('text:不应触发')).toBe(false);
    if (options.target === 'tv') {
      expect(app.enabled('id:gallery-input-disabled-activate')).toBe(false);
      expect(app.shows('role:button[短剧名称错误示例：未输入]')).toBe(true);
    }
    if (options.host && options.artifacts)
      await app.screenshot(`${options.artifacts}/search-pending-and-disabled.png`);
    await app.press('id:gallery-query-pending');
    await app.press('id:gallery-query-submit');
    await app.waitFor('text:搜索：保留草稿');
    app.dispose();
  });
  test('primary selection keeps readable text through hover, pending and recovery', async () => {
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, settings(theme));
      await app.press('id:gallery-sheet-controls');
      const color = (label = '已选择观看') =>
        app.spanStyle(`id:gallery-primary-selected >> text:${label}`).color;
      const selectedColor = theme === 'light' ? '#9f202aff' : '#ffb5b9ff';
      expect(color()).toBe(selectedColor);
      if (options.host !== 'android') {
        await app.hover('id:gallery-primary-selected');
        expect(color()).toBe(selectedColor);
      }
      if (options.host && options.artifacts)
        await app.screenshot(`${options.artifacts}/primary-selected-${theme}.png`);
      await app.press('id:gallery-primary-selected');
      expect(color('选择观看')).toBe(theme === 'light' ? '#ffffffff' : '#311216ff');
      await app.press('id:gallery-primary-selected');
      await app.press('id:gallery-toggle-pending');
      expect(app.enabled('id:gallery-primary-selected')).toBe(false);
      expect(color('处理中…')).toBe(theme === 'light' ? '#686a64ff' : '#a6ada0ff');
      await expect(app.press('id:gallery-primary-selected')).rejects.toMatchObject({
        code: 'ERR_NSH_TEST_DISABLED',
      });
      await app.press('id:gallery-toggle-pending');
      expect(app.enabled('id:gallery-primary-selected')).toBe(true);
      expect(color()).toBe(selectedColor);
      app.dispose();
    }
  });
  test('confirmation starts with the safe action and escape restores its source', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-layers');
    await app.press('id:gallery-open-confirm');
    if (options.host && options.artifacts)
      await app.screenshot(`${options.artifacts}/confirm-safe-focus.png`);
    await app.keyboard.press('enter');
    await app.waitFor('text:已保留观看记录');
    expect(app.shows('text:记录已移除')).toBe(false);
    await app.press('id:gallery-open-confirm');
    await app.keyboard.press('escape');
    await app.waitFor('id:gallery-confirm', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-confirm');
    await app.press('id:gallery-confirm-confirm');
    await app.waitFor('text:记录已移除');
    app.dispose();
  });
  test('accordion and removable chips preserve caller state and focus continuity', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-navigation');
    await app.press('id:gallery-accordion-about');
    await app.waitFor('text:春山不负，共 80 集，已完结。');
    await app.press('id:gallery-accordion-about');
    expect(app.shows('text:春山不负，共 80 集，已完结。')).toBe(false);
    await app.press('id:gallery-sheet-content');
    await app.press('id:gallery-chips-city');
    await app.waitFor('id:gallery-chips-city', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-chips-finished', { state: 'gone' });
    await app.keyboard.press('enter');
    await app.waitFor('id:gallery-chips-city');
    await app.waitFor('id:gallery-chips-finished');
    app.dispose();
  });
  test('composition recipes keep search, pagination and cinema actions interactive', async () => {
    const app = await open(entry, settings());
    await app.press('id:gallery-sheet-forms');
    await app.press('id:gallery-show-suggestions');
    await app.waitFor('id:search-suggestions');
    await app.press('id:gallery-suggestion-drama');
    expect(app.value('id:search-input')).toBe('春山不负');
    expect(app.shows('id:search-suggestions')).toBe(false);
    await app.press('id:gallery-sheet-navigation');
    await app.press('id:gallery-back');
    await app.waitFor('text:当前位置：分类');
    await app.press('id:gallery-page-5');
    await app.waitFor('text:第 5 / 5 页');
    await app.press('id:gallery-load-more');
    await app.press('id:gallery-load-more');
    expect(app.enabled('id:gallery-load-more')).toBe(false);
    await app.waitFor('text:已加载 36 条演示条目');
    await app.press('id:gallery-sheet-cinema');
    await app.press('label:切换播放状态');
    await app.waitFor('text:播放中 · 示例画面');
    await app.press('id:gallery-open-episode-panel');
    await app.waitFor('text:选集 · 示例');
    await app.keyboard.press('escape');
    await app.waitFor('text:选集 · 示例', { state: 'gone' });
    app.dispose();
  });
  test('all component groups render in both semantic themes', async () => {
    const screens = options.screen
      ? [options.screen]
      : [
          'foundation',
          'controls',
          'forms',
          'navigation',
          'layers',
          'content',
          'cinema',
          'feedback',
        ];
    for (const theme of ['light', 'dark'] as const) {
      const app = await open(entry, settings(theme));
      for (const screen of screens) {
        await app.press(`id:gallery-sheet-${screen}`);
        expect(app.shows('text:基础组件验收')).toBe(true);
        if (options.host && options.artifacts) {
          await app.screenshot(
            `${options.artifacts}/components-${options.target ?? 'desktop'}-${screen}-${theme}.png`,
          );
          if (['forms', 'content', 'feedback'].includes(screen)) {
            await app.scroll('id:gallery-scroll', 1000);
            await app.screenshot(
              `${options.artifacts}/components-${options.target ?? 'desktop'}-${screen}-${theme}-bottom.png`,
            );
            if (screen === 'content') {
              for (const part of [2, 3, 4]) {
                await app.scroll('id:gallery-scroll', 700);
                await app.screenshot(
                  `${options.artifacts}/components-${options.target ?? 'desktop'}-${screen}-${theme}-lower-${part}.png`,
                );
              }
            }
          }
        }
      }
      app.dispose();
    }
  });
}
