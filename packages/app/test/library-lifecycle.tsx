import { expect, open, test } from 'nsh/test';

export function registerLibraryLifecycleTests() {
  test('library lifetime: an owner disposed in the save turn cannot lazily open a session or dispatch queued progress', async () => {
    const app = await open('./LibraryLifecyclePreview.tsx');
    await app.waitFor('text:old-ready:true');
    await app.press('丢弃旧宿主');
    await app.waitUntil(() => app.texts().some((text) => text.includes('old-unmounted')));
    await app.wait(50);
    expect(app.shows('text:old-sessions:0')).toBe(true);
    expect(app.shows('text:old-writes:0')).toBe(true);
    expect(app.shows('text:persisted:10')).toBe(true);
  });
  test('library lifetime: synchronous shutdown retains the final checkpoint and drains accepted writes after unmount', async () => {
    const app = await open('./LibraryLifecyclePreview.tsx');
    await app.waitFor('text:old-ready:true');
    await app.press('排空旧宿主');
    await app.waitUntil(() => app.texts().some((text) => text.includes('old-write-1')));
    expect(app.shows('text:old-sessions:1')).toBe(true);
    await app.press('完成旧写入');
    await app.waitUntil(() => app.texts().some((text) => text.includes('old-write-5')));
    expect(app.texts().some((text) => text.includes('old-drained'))).toBe(false);
    await app.press('完成旧写入');
    await app.waitUntil(() => app.texts().some((text) => text.includes('old-drained')));
    expect(app.shows('text:old-writes:2')).toBe(true);
    expect(app.shows('text:persisted:5')).toBe(true);
  });
  test('library lifetime: a new controller can clear before the old shutdown queue opens a session without old progress reviving it', async () => {
    const app = await open('./LibraryLifecyclePreview.tsx');
    await app.waitFor('text:old-ready:true');
    await app.press('接管并清空');
    await app.waitUntil(() => app.texts().some((text) => text.includes('new-write-clear')));
    expect(app.shows('text:old-sessions:0')).toBe(true);
    expect(app.shows('text:old-writes:0')).toBe(true);
    expect(app.shows('text:new-sessions:1')).toBe(true);
    await app.press('完成新写入');
    await app.waitUntil(() => app.texts().some((text) => text.includes('new-cleared')));
    await app.wait(50);
    expect(app.shows('text:old-writes:0')).toBe(true);
    expect(app.shows('text:persisted:none')).toBe(true);
  });
}
