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
      await app.press('删除123');
      await app.press('排空保存');
      await app.waitFor('text:completion:drained');
      expect(app.shows(foreign ? 'text:read-1' : 'text:read-1|abort-1')).toBe(true);
      expect(app.shows('text:read-count:1')).toBe(true);
      expect(app.shows('text:write-count:0')).toBe(true);
      expect(app.shows('text:changes:')).toBe(true);
      expect(app.shows('text:snapshot:20')).toBe(false);
      expect(app.shows('text:no-warning')).toBe(false);
      expect(app.shows('text:operation:none')).toBe(true);
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
  test('progress and removal share one queue, and new viewing can create a record after removal', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('删除123');
    await app.press('准备更新');
    expect(app.shows('text:changes:progress-123-20')).toBe(true);
    await app.press('完成写入');
    await app.waitFor('text:changes:progress-123-20|remove-123');
    expect(app.shows('text:completion:prepared')).toBe(false);
    await app.press('完成写入');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:snapshot:none')).toBe(true);
    expect(app.shows('text:history:none')).toBe(true);
    expect(app.shows('text:resume:none')).toBe(true);
    await app.press('保存40');
    await app.press('完成写入');
    await app.waitFor('text:snapshot:40');
    expect(app.shows('text:read-1|write-1-1|write-2-1|write-3-1')).toBe(true);
  });
  test('removal invalidates only older checkpoints in its scope while unrelated failed progress still retries', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('写入失败');
    await app.press('保存其他剧');
    await app.press('写入失败');
    await app.press('删除123');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    await app.press('准备更新');
    await app.waitFor('text:changes:progress-123-20|progress-124-30|remove-123|progress-124-30');
    await app.press('完成写入');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:ids:124')).toBe(true);
    expect(app.shows('text:no-warning')).toBe(true);
  });
  test('clear supersedes all older guest checkpoints without blocking later real progress events', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('写入失败');
    await app.press('保存其他剧');
    await app.press('写入失败');
    await app.press('清空记录');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    await app.press('准备更新');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:changes:progress-123-20|progress-124-30|clear')).toBe(true);
    expect(app.shows('text:snapshot:none')).toBe(true);
    await app.press('保存40');
    await app.press('完成写入');
    await app.waitFor('text:snapshot:40');
  });
  test('a captured selected job deduplicates display order, rejects duplicate confirmation and retries only the remainder', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('四条记录');
    await app.press('完成读取');
    await app.press('删除四条');
    await app.press('删除123');
    expect(app.shows('text:scope:123,124,125,126')).toBe(true);
    await app.press('完成写入');
    await app.waitFor('text:changes:remove-123|remove-124');
    await app.press('完成写入');
    await app.waitFor('text:changes:remove-123|remove-124|remove-125');
    await app.press('写入失败');
    await app.waitFor('text:operation:partial');
    expect(app.shows('text:removed:123,124')).toBe(true);
    expect(app.shows('text:remaining:125,126')).toBe(true);
    expect(app.shows('text:ids:125,126')).toBe(true);
    await app.press('重试删除');
    await app.press('完成写入');
    await app.waitFor('text:changes:remove-123|remove-124|remove-125|remove-125|remove-126');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    expect(app.shows('text:ids:')).toBe(true);
  });
  test('lost removal responses retain the original barrier and cannot revive an older checkpoint during update', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('写入失败');
    await app.press('重新读取');
    await app.press('删除123');
    await app.press('提交后丢响应');
    await app.waitFor('text:operation:unresolved');
    await app.press('完成读取');
    await app.press('准备更新');
    await app.waitFor('text:completion:failed');
    expect(app.shows('text:snapshot:10')).toBe(true);
    expect(app.shows('text:changes:progress-123-20|remove-123')).toBe(true);
    await app.press('重试删除');
    await app.waitFor('text:operation:complete');
    expect(app.shows('text:snapshot:none')).toBe(true);
    expect(app.shows('text:changes:progress-123-20|remove-123')).toBe(true);
    await app.press('准备更新');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:no-warning')).toBe(true);
  });
  test('an unresolved progress dispatch must terminate before a later confirmed removal can execute', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('保存20');
    await app.press('删除123');
    await app.press('提交后丢响应');
    await app.waitFor('text:operation:unresolved');
    expect(app.shows('text:changes:progress-123-20')).toBe(true);
    await app.press('重试删除');
    await app.waitFor('text:changes:progress-123-20|remove-123');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    expect(app.shows('text:snapshot:none')).toBe(true);
    expect(app.shows('text:no-warning')).toBe(true);
  });
  test('a lost failed receipt is resolved before an explicit business retry receives a new operation identity', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('删除123');
    await app.press('失败回执丢失');
    await app.waitFor('text:operation:unresolved');
    await app.press('重试删除');
    await app.waitFor('text:operation:partial');
    expect(app.shows('text:changes:remove-123')).toBe(true);
    expect(app.shows('text:ids:123')).toBe(true);
    await app.press('重试删除');
    await app.waitFor('text:changes:remove-123|remove-123');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    expect(app.shows('text:snapshot:none')).toBe(true);
  });
  test('a business removal retry supersedes newer failed progress admitted after its previous terminal failure', async () => {
    const app = await open('./LibraryStatePreview.tsx');
    await app.press('完成读取');
    await app.press('删除123');
    await app.press('写入失败');
    await app.waitFor('text:operation:partial');
    await app.press('保存40');
    await app.press('写入失败');
    await app.press('重试删除');
    await app.press('完成写入');
    await app.waitFor('text:operation:complete');
    await app.press('准备更新');
    await app.waitFor('text:completion:prepared');
    expect(app.shows('text:changes:remove-123|progress-123-40|remove-123')).toBe(true);
    expect(app.shows('text:snapshot:none')).toBe(true);
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
      actors: [{ actor_id: '9007199254740993', name: '演员', avatar: '' }],
      related: [{ series_id: '456', title: '相关作品', cover: '', intro: '' }],
    };
    const saved = libraryDrama(detail as Drama);
    expect(JSON.stringify({ action: 'progress', drama: saved }).length < 32768).toBe(true);
    expect(saved.episodes).toBe(undefined);
    const payload = JSON.stringify({ action: 'progress', drama: saved });
    expect(/"(?:actors|related|episodes)":/.test(payload)).toBe(false);
    expect(detail.episodes.length).toBe(1000);
    expect(detail.actors[0].actor_id).toBe('9007199254740993');
    expect(detail.related[0].series_id).toBe('456');
  });
}
