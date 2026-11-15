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
    await app.press('id:history-confirm-cancel');
    await app.waitFor('id:history-operation');
    await app.press('id:history-fixture-active');
    await app.waitFor('text:synthetic · mode:slow · active:false · count:13 · opened:none');
    await app.press('id:history-fixture-active');
    await app.waitFor('text:synthetic · mode:slow · active:true · count:13 · opened:none');
    await app.press('id:history-manage');
    await app.waitFor('text:删除所选（0）');
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
}
