import { expect, open, test } from 'nsh/test';

export function registerFocusedRemovalTests(entry: string, artifacts?: string) {
  test('removable action retains native button activation and hands off its owned focus', async () => {
    for (const key of ['enter', 'space']) {
      const app = await open(entry, {
        platform: 'macos',
        width: key === 'enter' ? 1180 : 1440,
        height: key === 'enter' ? 780 : 1000,
        colorScheme: key === 'enter' ? 'light' : 'dark',
        reducedMotion: key === 'enter',
        clock: {},
        network: {},
      });
      await app.keyboard.press('tab');
      await app.keyboard.press('tab');
      if (artifacts) await app.screenshot(`${artifacts}/removal-${key}-focused.png`);
      await app.keyboard.press(key);
      await app.waitFor('text:presses:1');
      await app.waitFor('text:handoffs:1');
      expect(app.shows('id:removable-action')).toBe(false);
      await app.keyboard.press('x');
      expect(app.value('id:search-input')).toBe('x');
      if (artifacts) await app.screenshot(`${artifacts}/removal-${key}-returned.png`);
      app.dispose();
    }
  });
  test('removable action skips disabled activation, has one Tab stop and respects newer focus', async () => {
    const app = await open(entry, {
      platform: 'macos',
      width: 1180,
      height: 780,
      colorScheme: 'dark',
      reducedMotion: true,
      clock: {},
      network: {},
    });
    await app.press('切换禁用');
    expect(app.enabled('id:removable-action')).toBe(false);
    expect(app.shows('text:presses:0')).toBe(true);
    await expect(app.press('role:button[追加内容]')).rejects.toMatchObject({
      code: 'ERR_NSH_TEST_DISABLED',
    });
    await app.press('切换禁用');
    await app.press('id:removable-action');
    await app.keyboard.press('tab');
    await app.keyboard.press('enter');
    await app.waitFor('text:following:1');
    await app.waitFor('id:removable-action', { state: 'gone' });
    expect(app.shows('text:handoffs:0')).toBe(true);
    await app.keyboard.press('enter');
    await app.waitFor('text:following:2');
    await app.press('重新显示');
    await app.press('id:removable-action');
    await app.keyboard.press('shift+tab');
    for (const key of ['n', 'e', 'w']) await app.keyboard.press(key);
    await app.waitFor('id:removable-action', { state: 'gone' });
    await app.keyboard.press('x');
    expect(app.value('id:search-input')).toBe('newx');
    expect(app.shows('text:handoffs:0')).toBe(true);
    if (artifacts) await app.screenshot(`${artifacts}/removal-keeps-new-focus.png`);
    app.dispose();
  });
}

/** The real Search mounts here; an abort-ignoring transport completes only on command. */
export function registerSearchFocusTests(entry: string) {
  test('Search terminal handoff rejects newer query, refresh, navigation and owner removal', async () => {
    for (const action of ['完成旧页', '搜索新查询', '刷新查询', '离开查询', '移除查询']) {
      const app = await open(entry, {
        platform: 'macos',
        width: 1180,
        height: 780,
        reducedMotion: true,
        clock: {},
        network: {},
      });
      await app.press('搜索旧查询');
      await app.waitFor('id:search-more');
      await app.press(action);
      await app.press('id:search-more');
      await app.waitFor('正在加载…');
      await app.wait(1200);
      expect(app.texts().some((text) => text.includes('focus-handoff'))).toBe(
        action === '完成旧页',
      );
      if (action === '完成旧页') {
        await app.keyboard.press('x');
        expect(app.value('id:search-input')).toBe('旧查询x');
      }
      if (action === '搜索新查询') {
        await app.waitFor('id:drama-200');
        await app.press('完成旧页');
        await app.press('id:search-more');
        await app.waitFor('正在加载…');
        await app.wait(1200);
        expect(app.texts().some((text) => text.includes('focus-handoff'))).toBe(true);
        await app.keyboard.press('x');
        expect(app.value('id:search-input')).toBe('新查询x');
      }
      if (action === '刷新查询') await app.waitFor('id:drama-100');
      if (action === '离开查询' || action === '移除查询')
        expect(app.shows('id:search-more')).toBe(false);
      app.dispose();
    }
  });
}
