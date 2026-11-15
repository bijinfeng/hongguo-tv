import { expect, open, test, type OpenOptions } from 'nsh/test';
import type { ProductTarget } from '@hongguo/ui';

export function registerHistoryManagementTests(entry: string, target: ProductTarget) {
  const options: OpenOptions = {
    platform: 'macos',
    width: target === 'tv' ? 1920 : 1440,
    height: 1080,
    reducedMotion: true,
    clock: {},
    network: {},
  };
  const first = '9007199254740992';
  const second = '9007199254740993';
  test('single removal keeps exact identity and cancel is the default safe action', async () => {
    const app = await open(entry, options);
    await app.press('id:history-manage');
    await app.press(`id:history-remove-${second}`);
    await app.wait(80);
    await app.keyboard.press('enter');
    expect(app.texts().includes('calls:')).toBe(true);
    expect(app.shows(`id:history-${second}`)).toBe(true);
    await app.press(`id:history-remove-${second}`);
    await app.press('id:history-confirm-confirm');
    await app.waitFor(`text:calls:remove:${second}`);
    await app.waitFor('text:synthetic · mode:success · active:true · count:13 · opened:none');
    expect(app.shows(`id:history-${second}`)).toBe(false);
    expect(app.shows(`id:history-${first}`)).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('select all captures offscreen records and committed partial deletion retries only remaining IDs', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-partial');
    await app.press('id:history-manage');
    await app.press('id:history-select-all');
    await app.waitFor('text:删除所选（14）');
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:重试剩余（13）');
    await app.waitFor('text:synthetic · mode:partial · active:true · count:13 · opened:none');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('id:history-empty-discover');
    await app.waitFor('text:synthetic · mode:partial · active:true · count:0 · opened:none');
    const log = app.texts().find((text) => text.startsWith('calls:')) ?? '';
    expect(log.includes(`remove:${first},${second},8002`)).toBe(true);
    expect(log.includes(`retry:partial:${second},8002`)).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('an unknown outcome is reconciled explicitly before retrying a failed deletion', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-unresolved');
    await app.press('id:history-manage');
    await app.press(`id:history-remove-${second}`);
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:确认删除结果');
    expect(app.shows(`id:history-${second}`)).toBe(true);
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:重试剩余（1）');
    expect(app.shows(`id:history-${second}`)).toBe(true);
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:synthetic · mode:unresolved · active:true · count:13 · opened:none');
    expect(
      app
        .texts()
        .some((text) => text.includes(`retry:unresolved:${second}|retry:partial:${second}`)),
    ).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('closing pending presentation preserves the job and leaving clears page selection', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-slow');
    await app.press('id:history-manage');
    await app.press(`id:history-select-${first}`);
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:关闭');
    expect(app.enabled('id:history-confirm-confirm')).toBe(false);
    await expect(app.press('id:history-confirm-confirm')).rejects.toMatchObject({
      code: 'ERR_NSH_TEST_DISABLED',
    });
    expect(app.texts().filter((text) => text === `calls:remove:${first}`).length).toBe(1);
    await app.press('id:history-confirm-cancel');
    await app.waitFor('id:history-operation');
    expect(app.enabled(`id:history-remove-${second}`)).toBe(false);
    await app.wait(80);
    await app.keyboard.press('enter');
    expect(app.shows('id:history-delete-selected')).toBe(false);
    await app.press('id:history-fixture-active');
    await app.waitFor('text:synthetic · mode:slow · active:false · count:13 · opened:none');
    await app.press('id:history-fixture-active');
    await app.waitFor('text:synthetic · mode:slow · active:true · count:13 · opened:none');
    await app.press('id:history-manage');
    await app.waitFor('text:删除所选（0）');
    expect(app.texts().includes(`calls:remove:${first}`)).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('clear uses all records and unavailable owners cannot create a deletion', async () => {
    const app = await open(entry, options);
    await app.press('id:history-manage');
    await app.press('id:history-clear');
    await app.press('id:history-confirm-cancel');
    expect(app.texts().includes('calls:')).toBe(true);
    await app.press('id:history-clear');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('id:history-empty-discover');
    expect(app.texts().some((text) => text.startsWith(`calls:clear:${first},${second}`))).toBe(
      true,
    );
    app.dispose();
    const foreign = await open(entry, options);
    await foreign.press('id:history-fixture-owner');
    expect(foreign.enabled('id:history-manage')).toBe(false);
    expect(foreign.shows('id:history-clear')).toBe(false);
    expect(foreign.texts().includes('calls:')).toBe(true);
    await foreign.press('id:history-fixture-unloaded');
    expect(foreign.enabled('id:history-manage')).toBe(false);
    expect(foreign.shows('id:history-select-all')).toBe(false);
    expect(foreign.requests()).toEqual([]);
  });
  test('a removed final virtual row returns to its surviving neighbor and clear focuses empty recovery', async () => {
    const app = await open(entry, options);
    await app.press('id:history-manage');
    for (let step = 0; step < 7 && !app.shows('id:history-remove-8013'); step++) {
      await app.scroll('id:history-list', 600);
      await app.wait(80);
    }
    // Materialized overscan is not proof the full source is inside the viewport.
    await app.scroll('id:history-list', 600);
    await app.press('id:history-remove-8013');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:synthetic · mode:success · active:true · count:13 · opened:none');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:synthetic · mode:success · active:true · count:13 · opened:8012');
    await app.press('id:history-clear');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('id:history-empty-discover');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:synthetic · mode:success · active:true · count:0 · opened:discover');
    expect(app.requests()).toEqual([]);
  });
  test('newer focus intent wins while deletion restoration is queued', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-interrupt');
    await app.press('id:history-manage');
    await app.press(`id:history-remove-${second}`);
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:synthetic · mode:interrupt · active:true · count:13 · opened:none');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:alternate:1');
    expect(
      app.texts().includes('synthetic · mode:interrupt · active:true · count:13 · opened:none'),
    ).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('mixed selection selects all, all selection clears, and committed snapshot removal prunes selection', async () => {
    const app = await open(entry, options);
    expect(app.shows('id:history-select-all')).toBe(false);
    await app.press('id:history-manage');
    expect(app.enabled('id:history-delete-selected')).toBe(false);
    await app.press(`id:history-select-${first}`);
    await app.waitFor('text:删除所选（1）');
    // A mixed aggregate must select the complete snapshot, including virtualized records.
    await app.press('id:history-select-all');
    await app.waitFor('text:删除所选（14）');
    await app.press('id:history-select-all');
    await app.waitFor('text:删除所选（0）');
    expect(app.enabled('id:history-delete-selected')).toBe(false);
    await app.press(`id:history-select-${first}`);
    await app.press('id:history-fixture-drop-first');
    await app.waitFor('text:删除所选（0）');
    await app.press('id:history-fixture-restore-first');
    await app.waitFor('text:synthetic · mode:success · active:true · count:14 · opened:none');
    await app.waitFor('text:删除所选（0）');
    await app.press('id:history-manage');
    expect(app.shows(`id:history-select-${first}`)).toBe(false);
    expect(app.texts().includes('calls:')).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('selection and recycled row actions keep their exact identities after scrolling away and back', async () => {
    const app = await open(entry, options);
    await app.press('id:history-manage');
    await app.press(`id:history-select-${second}`);
    for (let step = 0; step < 7 && !app.shows('id:history-select-8013'); step++) {
      await app.scroll('id:history-list', 600);
      await app.wait(80);
    }
    await app.scroll('id:history-list', 600);
    await app.press('id:history-select-8013');
    await app.waitFor('text:删除所选（2）');
    await app.scroll('id:history-list', -10000);
    await app.waitFor(`id:history-select-${second}`);
    // Toggling a rematerialized selected row must remove that exact membership.
    await app.press(`id:history-select-${second}`);
    await app.waitFor('text:删除所选（1）');
    await app.press(`id:history-select-${second}`);
    await app.waitFor('text:删除所选（2）');
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor(`text:calls:remove:${second},8013`);
    await app.waitFor('text:synthetic · mode:success · active:true · count:12 · opened:none');
    expect(app.shows(`id:history-${first}`)).toBe(true);
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:synthetic · mode:success · active:true · count:12 · opened:8002');
    expect(app.requests()).toEqual([]);
  });
  test('Back cancels each destructive scope without calls and returns to its surviving source', async () => {
    const app = await open(entry, options);
    await app.press('id:history-manage');
    await app.press(`id:history-select-${second}`);
    for (const source of [`history-remove-${second}`, 'history-delete-selected', 'history-clear']) {
      await app.press(`id:${source}`);
      await app.waitFor('id:history-confirm');
      await app.back();
      await app.waitFor('id:history-confirm', { state: 'gone' });
      expect(app.texts().includes('calls:')).toBe(true);
      await app.wait(80);
      await app.keyboard.press('enter');
      await app.waitFor('id:history-confirm');
      expect(app.texts().includes('calls:')).toBe(true);
      await app.press('id:history-confirm-cancel');
      await app.waitFor('id:history-confirm', { state: 'gone' });
    }
    await app.waitFor('text:synthetic · mode:success · active:true · count:14 · opened:none');
    expect(app.requests()).toEqual([]);
  });
  test('closing a failed confirmation focuses its available retry instead of disabled selection', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-partial');
    await app.press('id:history-manage');
    await app.press(`id:history-select-${first}`);
    await app.press(`id:history-select-${second}`);
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:重试剩余（1）');
    await app.press('id:history-confirm-cancel');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor(`text:calls:remove:${first},${second}|retry:partial:${second}`);
    await app.waitFor('text:synthetic · mode:partial · active:true · count:12 · opened:none');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:synthetic · mode:partial · active:true · count:12 · opened:8002');
    expect(app.requests()).toEqual([]);
  });
  test('partial work survives leaving without automatic replay and explicit retry restores a committed neighbor', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-partial');
    await app.press('id:history-manage');
    await app.press(`id:history-select-${first}`);
    await app.press(`id:history-select-${second}`);
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:重试剩余（1）');
    await app.press('id:history-confirm-cancel');
    await app.press('id:history-fixture-active');
    await app.press('id:history-fixture-active');
    await app.wait(80);
    expect(app.shows('id:history-delete-selected')).toBe(false);
    expect(app.texts().includes(`calls:remove:${first},${second}`)).toBe(true);
    await app.waitFor('id:history-operation-retry');
    await app.press('id:history-operation-retry');
    await app.waitFor(`text:calls:remove:${first},${second}|retry:partial:${second}`);
    await app.waitFor('text:synthetic · mode:partial · active:true · count:12 · opened:none');
    await app.wait(80);
    await app.keyboard.press('enter');
    await app.waitFor('text:synthetic · mode:partial · active:true · count:12 · opened:8002');
    expect(app.requests()).toEqual([]);
  });
  test('a dismissed pending deletion completes in background without taking system-owned focus on reactivation', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-slow');
    await app.press('id:history-manage');
    await app.press(`id:history-remove-${second}`);
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:关闭');
    await app.press('id:history-confirm-cancel');
    await app.wait(80);
    await app.press('id:history-fixture-native-focus');
    await app.waitFor('text:alternate-focused:true');
    await app.setLifecycle('background');
    await app.waitFor('text:synthetic · mode:slow · active:true · count:13 · opened:none');
    await app.wait(80);
    expect(app.texts().includes('alternate-focused:true')).toBe(true);
    expect(app.texts().includes(`calls:remove:${second}`)).toBe(true);
    await app.setLifecycle('active');
    await app.wait(80);
    expect(app.texts().includes('alternate-focused:true')).toBe(true);
    expect(app.texts().includes(`calls:remove:${second}`)).toBe(true);
    await app.keyboard.press('enter');
    await app.waitFor('text:alternate:1');
    expect(
      app.texts().includes('synthetic · mode:slow · active:true · count:13 · opened:none'),
    ).toBe(true);
    expect(app.requests()).toEqual([]);
  });
  test('a page retry completing in background neither restores its neighbor nor replays on reactivation', async () => {
    const app = await open(entry, options);
    await app.press('id:history-fixture-partial');
    await app.press('id:history-manage');
    await app.press(`id:history-select-${first}`);
    await app.press(`id:history-select-${second}`);
    await app.press('id:history-delete-selected');
    await app.press('id:history-confirm-confirm');
    await app.waitFor('text:重试剩余（1）');
    await app.press('id:history-confirm-cancel');
    await app.wait(80);
    await app.press('id:history-fixture-slow');
    await app.press('id:history-operation-retry');
    await app.press('id:history-fixture-native-focus');
    await app.waitFor('text:alternate-focused:true');
    await app.setLifecycle('background');
    await app.waitFor('text:synthetic · mode:slow · active:true · count:12 · opened:none');
    await app.wait(80);
    expect(app.texts().includes('alternate-focused:true')).toBe(true);
    expect(app.texts().includes(`calls:remove:${first},${second}|retry:partial:${second}`)).toBe(
      true,
    );
    await app.setLifecycle('active');
    await app.wait(80);
    expect(app.texts().includes('alternate-focused:true')).toBe(true);
    expect(app.texts().includes(`calls:remove:${first},${second}|retry:partial:${second}`)).toBe(
      true,
    );
    await app.keyboard.press('enter');
    await app.waitFor('text:alternate:1');
    expect(
      app.texts().includes('synthetic · mode:slow · active:true · count:12 · opened:none'),
    ).toBe(true);
    expect(app.requests()).toEqual([]);
  });
}
