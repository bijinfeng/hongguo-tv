import { expect, open, test } from 'nsh/test';

export function registerCategoryTests() {
  test('category selection cancels stale continuation, preserves dynamic choices and retries the same empty-page cursor', async () => {
    const app = await open('./CategoryStatePreview.tsx');
    expect(app.texts().some((t) => t.includes('read1'))).toBe(false);
    await app.press('激活分类');
    await app.waitUntil(() =>
      app.texts().some((t) => t.includes('genre=&category_dim_theme=&sort=&selectors=1')),
    );
    await app.press('完成首屏');
    await app.waitFor('text:ids:1,2');
    expect(app.shows('text:choices:all,online_time,hot_score')).toBe(true);
    await app.press('追加分类');
    await app.waitUntil(() =>
      app.texts().some((t) => t.includes('offset=15&session_id=session-1&shown=1%2C2')),
    );
    await app.press('悬疑筛选');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort2')));
    await app.press('完成旧续页');
    expect(app.shows('text:ids:1,2')).toBe(false);
    await app.press('完成空页');
    await app.waitFor('text:ids:');
    expect(app.shows('text:themes:all,cate_165')).toBe(true);
    await app.press('追加分类');
    await app.waitUntil(() =>
      app.texts().some((t) => t.includes('offset=45&session_id=session-3')),
    );
    await app.press('失败当前');
    await app.waitFor('category-error');
    await app.press('重试分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read5:')));
    const events = app.texts().find((t) => t.includes('read5:'))!;
    expect(events.match(/read4:([^|]+)/)?.[1]).toBe(events.match(/read5:([^|]+)/)?.[1]);
    await app.press('完成当前');
    await app.waitFor('text:ids:1,2');
    await app.press('漫剧筛选');
    await app.waitUntil(() =>
      app
        .texts()
        .some((t) => t.includes('genre=comic_series&category_dim_theme=&sort=&selectors=1')),
    );
    expect(app.shows('text:themes:all')).toBe(true);
    await app.press('清除筛选');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort6')));
    await app.waitUntil(() =>
      app
        .texts()
        .some((t) =>
          t.includes('read7:/api/v1/category?genre=&category_dim_theme=&sort=&selectors=1'),
        ),
    );
  });
  test('hidden and disposed category owners reject late completion and malformed continuation', async () => {
    const app = await open('./CategoryStatePreview.tsx');
    await app.press('激活分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read1:')));
    await app.press('隐藏分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort1')));
    await app.press('完成首屏');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('激活分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read2:')));
    await app.press('完成坏游标');
    await app.waitFor('category-error');
    await app.press('重试分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read3:')));
    await app.press('移除分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort3')));
    await app.press('完成当前');
    expect(app.shows('id:category-owner')).toBe(false);
  });
  test('category background cancels pending work, retains successful pages and bounds shown to the last 128 exact ids', async () => {
    const app = await open('./CategoryStatePreview.tsx');
    await app.press('激活分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read1:')));
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort1')));
    await app.press('完成首屏');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.setLifecycle('active');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read2:')));
    await app.press('完成大量首屏');
    await app.waitFor('text:loading:false');
    await app.press('隐藏分类');
    await app.press('激活分类');
    expect(app.texts().some((t) => t.includes('read3:'))).toBe(false);
    await app.press('追加分类');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read3:')));
    const path = app
      .texts()
      .find((t) => t.includes('read3:'))!
      .match(/read3:([^|]+)/)![1];
    const ids = new URL(path, 'http://127.0.0.1').searchParams.get('shown')!.split(',');
    expect(ids.length).toBe(128);
    expect(ids[0]).toBe('23');
    expect(ids[127]).toBe('150');
  });
}
