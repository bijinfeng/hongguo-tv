import { expect, open, test } from 'nsh/test';

export function registerFeedTests() {
  test('feed keeps independent channels, deduplicates, accepts tab to cell0 and retries exact empty cursor', async () => {
    const app = await open('./FeedStatePreview.tsx');
    await app.press('激活');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read1:')));
    await app.press('完成');
    await app.waitFor('text:ids:1,2');
    await app.press('单次下一部');
    await app.waitFor('text:current:2');
    await app.press('漫剧');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read2:')));
    await app.press('完成');
    await app.waitFor('text:current:1');
    await app.press('下一部');
    await app.waitUntil(() =>
      app
        .texts()
        .some((t) =>
          t.includes(
            'channel=36&offset=0&feed_cell=123&feed_plan=456&session_id=session-2&shown=1%2C2',
          ),
        ),
    );
    await app.press('完成空页');
    await app.waitFor('text:current:2');
    await app.press('下一部');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read4:')));
    await app.press('失败');
    await app.waitFor('feed-error');
    await app.press('重试');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read5:')));
    const events = app.texts().find((t) => t.includes('read5:'))!;
    expect(events.match(/read4:([^|]+)/)?.[1]).toBe(events.match(/read5:([^|]+)/)?.[1]);
    await app.press('完成末页');
    await app.waitFor('text:ids:1,2,3');
    await app.waitFor('text:current:3');
    await app.press('推荐');
    await app.waitFor('text:current:2');
    await app.press('关注');
    await app.waitFor('text:current:none');
    expect(app.texts().some((t) => t.includes('channel=45'))).toBe(false);
  });
  test('feed fences hidden, background, switched and disposed responses; rejects stalled cells and bounds shown', async () => {
    const app = await open('./FeedStatePreview.tsx');
    await app.press('激活');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read1:')));
    await app.press('漫剧');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort1')));
    await app.press('完成旧请求');
    expect(app.shows('text:current:none')).toBe(true);
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort2')));
    await app.press('完成');
    expect(app.shows('text:current:none')).toBe(true);
    await app.setLifecycle('active');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read3:')));
    await app.press('隐藏');
    await app.press('完成');
    expect(app.shows('text:current:none')).toBe(true);
    await app.press('激活');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read4:')));
    await app.press('完成');
    await app.waitFor('text:ids:1,2');
    await app.press('下一部');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read5:')));
    await app.press('完成坏页');
    await app.waitFor('feed-error');
    await app.press('真人剧');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read6:')));
    await app.press('完成大量');
    for (let i = 0; i < 150; i++) await app.press('单次下一部');
    await app.waitUntil(() => app.texts().some((t) => t.includes('read7:')));
    const path = app
      .texts()
      .find((t) => t.includes('read7:'))!
      .match(/read7:([^|]+)/)![1];
    const shown = new URL(path, 'http://127.0.0.1').searchParams.get('shown')!.split(',');
    expect(shown.length).toBe(128);
    expect(shown[0]).toBe('23');
    expect(shown[127]).toBe('150');
    await app.press('移除');
    await app.waitUntil(() => app.texts().some((t) => t.includes('abort7')));
    await app.press('完成');
    expect(app.shows('id:feed-owner')).toBe(false);
  });
}
