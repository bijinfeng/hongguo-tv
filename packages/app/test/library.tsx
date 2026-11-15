import { expect, open, test } from 'nsh/test';
import { libraryDrama, type Drama } from '@hongguo/core-client';

export function registerLibraryTests() {
  test('library ignores a late pre-save read and all consumers share the commit', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('重新读取');
    await app.press('保存20');
    await app.waitFor('text:read-1|read-2|abort-2|write-1-1');
    await app.press('完成写入');
    await app.waitFor('text:snapshot:20');
    await app.press('完成读取');
    expect(app.shows('text:snapshot:20')).toBe(true);
    expect(app.shows('text:history:20')).toBe(true);
    expect(app.shows('text:resume:20')).toBe(true);
  });
  test('failed library refresh preserves the committed snapshot and retries distinctly', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('重新读取');
    await app.press('读取失败');
    expect(app.shows('text:snapshot:10')).toBe(true);
    expect(app.shows('text:history:10')).toBe(true);
    expect(app.shows('text:resume:10')).toBe(true);
    expect(app.shows('text:state:errored')).toBe(true);
    expect(app.shows('text:error:true')).toBe(true);
    await app.press('重新读取');
    expect(app.shows('text:state:refreshing')).toBe(true);
    await app.press('完成读取');
    expect(app.shows('text:state:ready')).toBe(true);
    expect(app.shows('text:error:false')).toBe(true);
  });
  test('a read waiting on the write tail is invalidated before a newer mutation dispatches', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('重新读取');
    await app.press('保存40');
    await app.press('完成写入');
    await app.waitFor('text:read-1|write-1-1|write-2-1');
    await app.press('完成写入');
    await app.waitFor('text:snapshot:40');
    expect(app.shows('text:read-1|write-1-1|write-2-1')).toBe(true);
    expect(app.shows('text:loading:false')).toBe(true);
  });
  test('unknown and foreign owners cannot dispatch guest history writes', async () => {
    for (const foreign of [false, true]) {
      const app = await open('./LibraryStatePreview.tsx');
      if (foreign) await app.press('其他所有者');
      await app.press('保存20');
      await app.press('排空保存');
      await app.waitFor('text:completion:drained');
      expect(app.shows('text:read-1')).toBe(true);
      expect(app.shows('text:snapshot:20')).toBe(false);
      expect(app.shows('text:no-warning')).toBe(false);
    }
  });
  test('update retries share the write queue and drain includes newly admitted progress', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('写入失败');
    await app.press('准备更新');
    await app.waitFor('text:read-1|write-1-1|write-2-1');
    await app.press('保存40');
    await app.press('完成写入');
    await app.waitFor('text:read-1|write-1-1|write-2-1|write-3-1');
    expect(app.shows('text:completion:prepared')).toBe(false);
    await app.press('完成写入');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:snapshot:40')).toBe(true);
    expect(app.shows('text:no-warning')).toBe(true);
  });
  test('an initially failed library read cannot authorize progress and explicit retry recovers after a guest read', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('读取失败');
    await app.press('保存20');
    await app.press('准备更新');
    await app.waitFor('text:completion:failed');
    expect(app.shows('text:read-1')).toBe(true);
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('重新读取');
    await app.press('完成读取');
    await app.press('准备更新');
    await app.waitFor('text:read-1|read-2|write-1-1');
    await app.press('完成写入');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:snapshot:20')).toBe(true);
    expect(app.shows('text:no-warning')).toBe(true);
  });
  test('full details fit the library request boundary without changing player data', () => {
    const detail = {
      series_id: '123',
      title: '测试剧集',
      cover: '',
      intro: '短剧'.repeat(10000),
      episodes: Array.from({ length: 1000 }, (_, index) => ({
        index,
        video_id: String(index),
        locked: false,
      })),
      reviews: 'x'.repeat(100000),
      actors: [{ actor_id: '9007199254740993', name: '演员', avatar: '' }],
      related: [{ series_id: '456', title: '相关作品', cover: '', intro: '' }],
    };
    const saved = libraryDrama(detail as Drama);
    expect(JSON.stringify({ action: 'progress', drama: saved }).length < 32768).toBe(true);
    expect(saved.episodes).toBe(undefined);
    const payload = JSON.stringify({ action: 'progress', drama: saved });
    expect(/"(?:actors|related|reviews|episodes)":/.test(payload)).toBe(false);
    expect(detail.episodes.length).toBe(1000);
    expect(detail.actors[0].actor_id).toBe('9007199254740993');
    expect(detail.related[0].series_id).toBe('456');
  });
}
