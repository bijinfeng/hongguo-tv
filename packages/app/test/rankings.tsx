import { expect, open, test, type App } from 'nsh/test';

function path(app: App, id: number): string {
  return (
    app
      .texts()
      .find((text) => text.includes(`read${id}:`))
      ?.match(new RegExp(`read${id}:([^|]+)`))?.[1] ?? ''
  );
}
function params(app: App, id: number) {
  return new URL(path(app, id), 'http://127.0.0.1').searchParams;
}
const read = (app: App, id: number) => app.waitUntil(() => !!path(app, id));

export function registerRankingsTests() {
  test('visible inactive rankings accept first and continued reads while background cancels late writes', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.setLifecycle('inactive');
    await app.press('完成榜单首屏');
    await app.waitFor('text:ids:drama:1,actor:1');
    expect(app.texts().some((text) => text.includes('abort1'))).toBe(false);
    await app.press('追加榜单');
    await read(app, 2);
    await app.press('完成榜单当前');
    await app.waitFor('text:cursor:40');
    expect(app.texts().some((text) => text.includes('abort2'))).toBe(false);
    await app.press('追加榜单');
    await read(app, 3);
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort3')));
    await app.press('完成榜单当前');
    expect(app.shows('text:cursor:40')).toBe(true);
    await app.setLifecycle('inactive');
    expect(path(app, 4)).toBe('');
    expect(app.shows('text:loading:false')).toBe(true);
    app.dispose();
  });

  test('rankings preserve actor/drama namespaces and dynamic menus across empty continuation and exact retry', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    expect(path(app, 1)).toBe('');
    await app.press('激活榜单');
    await read(app, 1);
    expect(path(app, 1)).toBe('/api/v1/lists/rank');
    await app.press('完成榜单首屏');
    await app.waitFor('text:ids:drama:1,actor:1');
    await app.press('追加榜单');
    await read(app, 2);
    expect(params(app, 2).get('offset')).toBe('20');
    expect(params(app, 2).get('session_id')).toBe('session-1');
    expect(params(app, 2).get('shown')).toBe('1');
    expect(path(app, 3)).toBe('');
    await app.press('第二子榜');
    await read(app, 3);
    expect(params(app, 3).get('rank')).toBe('weekly & raw');
    expect(params(app, 3).get('rank_sub')).toBe('sub & 2');
    expect(params(app, 3).has('offset')).toBe(false);
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort2')));
    await app.press('完成旧榜单续页');
    // The board stays on screen while the new selection loads; the late old-page answer is not
    // merged into it, so the rows are still the previous board's and the probe reports them stale.
    expect(app.shows('text:ids:none')).toBe(false);
    expect(app.texts().some((text) => text.includes('stale:true'))).toBe(true);
    await app.press('完成榜单空页');
    await app.waitFor('text:cursor:60');
    expect(app.texts().some((text) => text.includes('rank_sub:第二子榜:omitted:deep'))).toBe(true);
    await app.press('追加榜单');
    await read(app, 4);
    expect(params(app, 4).get('offset')).toBe('60');
    expect(params(app, 4).get('session_id')).toBe('session-3');
    expect(params(app, 4).get('shown')).toBe('');
    await app.press('失败榜单当前');
    await app.waitFor('rankings-error');
    expect(app.shows('text:加载失败，请重试')).toBe(true);
    expect(app.texts().some((text) => /backend-secret-token|\/private\/service/.test(text))).toBe(
      false,
    );
    await app.press('重试榜单');
    await read(app, 5);
    expect(path(app, 5)).toBe(path(app, 4));
    await app.press('完成榜单当前');
    await app.waitFor('text:ids:drama:1,actor:1');
    await app.press('追加榜单');
    await read(app, 6);
    await app.press('失败榜单当前');
    await app.waitFor('rankings-error');
    expect(app.shows('text:ids:drama:1,actor:1')).toBe(true);
    await app.press('重试榜单');
    await read(app, 7);
    expect(path(app, 7)).toBe(path(app, 6));
    await app.press('完成榜单当前');
    await app.waitFor('text:loading:false');
    await app.press('选择无效榜');
    expect(path(app, 8)).toBe('');
  });

  test('nested ranking and panel selections capture their exact parents and explicit empty IDs survive new default hints', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.press('完成榜单首屏');
    await app.waitFor('text:ids:drama:1,actor:1');
    await app.press('第二子榜');
    await read(app, 2);
    await app.press('完成榜单当前');
    await app.waitFor('text:loading:false');
    await app.press('更深子榜');
    await read(app, 3);
    expect(params(app, 3).get('rank_sub')).toBe('deep');
    await app.press('七天面板');
    await read(app, 4);
    expect(params(app, 4).get('rank')).toBe('weekly & raw');
    expect(params(app, 4).get('rank_sub')).toBe('deep');
    expect(params(app, 4).get('rank_panel')).toBe('panel/7');
    await app.press('完成相反默认');
    await app.waitFor('text:loading:false');
    expect(app.texts().some((text) => text.includes('rank:榜单:weekly & raw:'))).toBe(true);
    await app.press('空值面板');
    await read(app, 5);
    expect(params(app, 5).has('rank_panel')).toBe(true);
    expect(params(app, 5).get('rank_panel')).toBe('');
    await app.press('选择空值榜');
    await read(app, 6);
    expect(params(app, 6).has('rank')).toBe(true);
    expect(params(app, 6).get('rank')).toBe('');
    expect(params(app, 6).has('rank_sub')).toBe(false);
    expect(params(app, 6).has('rank_panel')).toBe(false);
    await app.press('完成榜单当前');
    await app.waitFor('text:loading:false');
    expect(app.texts().some((text) => text.includes('rank:榜单::'))).toBe(true);
  });

  test('subranking lookup ignores same opaque IDs inside a preceding subranking panel', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.press('完成榜单首屏');
    await app.waitFor('text:ids:drama:1,actor:1');
    await app.press('跨维度子榜');
    await read(app, 2);
    expect(params(app, 2).get('rank_sub')).toBe('shared/B');
    expect(app.texts().some((text) => text.includes('rank_sub:服务端榜名:shared/B:'))).toBe(true);
    expect(app.texts().some((text) => text.includes('rank_panel:同ID面板组:'))).toBe(false);
  });

  test('explicit nested panel choices retain every panel ancestor and the deepest group', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.press('完成榜单首屏');
    await app.waitFor('text:ids:drama:1,actor:1');
    await app.press('内层面板');
    await read(app, 2);
    expect(params(app, 2).get('rank_panel')).toBe('inner/B');
    expect(app.texts().some((text) => text.includes('rank_panel:外层组:outer/A:outer/A'))).toBe(
      true,
    );
    expect(app.texts().some((text) => text.includes('rank_panel:内层组:inner/B:inner/B'))).toBe(
      true,
    );
    expect(app.texts().some((text) => text.includes('rank_panel:末层组:omitted:deep/C'))).toBe(
      true,
    );
    await app.press('完成榜单当前');
    await app.waitFor('text:loading:false');
    await app.press('末层面板');
    await read(app, 3);
    expect(params(app, 3).get('rank_panel')).toBe('deep/C');
    expect(app.texts().some((text) => text.includes('rank_panel:外层组:outer/A:outer/A'))).toBe(
      true,
    );
    expect(app.texts().some((text) => text.includes('rank_panel:内层组:inner/B:inner/B'))).toBe(
      true,
    );
    expect(app.texts().some((text) => text.includes('rank_panel:末层组:deep/C:deep/C'))).toBe(true);
    expect(
      app.texts().some((text) => text.includes('rank_panel:外层选项:omitted:unrelated-child')),
    ).toBe(true);
    await app.press('完成榜单当前');
    await app.waitFor('text:loading:false');
    await app.press('追加榜单');
    await read(app, 4);
    expect(params(app, 4).get('rank_panel')).toBe('deep/C');
    expect(params(app, 4).get('offset')).toBe('60');
  });

  for (const target of ['desktop', 'tv'] as const) {
    test(`dense ranking filters scroll to all 32 panels while results and continuation recovery remain reachable on ${target}`, async () => {
      const app = await open('./RankingsStatePreview.tsx', {
        width: target === 'desktop' ? 1180 : 960,
        height: target === 'desktop' ? 780 : 540,
      });
      await app.press(target === 'desktop' ? '密集桌面榜单' : '密集电视榜单');
      await app.waitFor('id:ranking-drama:1');
      // The filter block is collapsed by default; the later panel groups appear once expanded.
      if (app.shows('id:ranking-filters-toggle')) await app.press('id:ranking-filters-toggle');
      const finalGroup = 'panel:["dense"]:group-31:31';
      // Desktop lists every option as a chip; TV names each group beside one selector, because a
      // remote cannot scan a chip row and a bare value would not say what it changes. The TV
      // fixture's last group keeps `choice-31` as its default, and a selector reports only a
      // different value, so the TV path chooses the group's second option.
      const chosen = target === 'desktop' ? 'choice-31' : 'choice-31b';
      if (target === 'desktop')
        await app.press(`id:ranking-choice-${encodeURIComponent(finalGroup)}-${chosen}`);
      else {
        await app.press(`id:ranking-group-${encodeURIComponent(finalGroup)}-trigger`);
        await app.press('筛选值31B');
      }
      await app.waitUntil(() => app.texts().some((text) => text.includes(`rank_panel=${chosen}`)));
      await app.press('id:ranking-drama:1');
      await app.waitFor('text:opened:drama:1');
      await app.press('id:ranking-more');
      await app.waitFor('重试加载更多');
      expect(app.shows('id:ranking-drama:1')).toBe(true);
      await app.press('id:ranking-more');
      await app.waitFor('id:ranking-drama:2');
      expect(app.shows('id:ranking-more')).toBe(false);
    });
  }

  test('hidden and disposed ranking owners reject late completion and nonadvancing cursors require explicit retry', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.press('隐藏榜单');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort1')));
    await app.press('完成榜单首屏');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.press('激活榜单');
    await read(app, 2);
    await app.press('完成榜单坏游标');
    await app.waitFor('rankings-error');
    expect(path(app, 3)).toBe('');
    await app.press('重试榜单');
    await read(app, 3);
    expect(path(app, 3)).toBe(path(app, 2));
    await app.press('移除榜单');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort3')));
    await app.press('完成榜单当前');
    expect(app.shows('id:rankings-owner')).toBe(false);
  });

  test('ranking background cancellation retains completed pages and bounds shown to 128 unique raw IDs', async () => {
    const app = await open('./RankingsStatePreview.tsx');
    await app.press('激活榜单');
    await read(app, 1);
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((text) => text.includes('abort1')));
    await app.press('完成榜单首屏');
    expect(app.shows('text:ids:none')).toBe(true);
    await app.setLifecycle('active');
    await read(app, 2);
    await app.press('完成大量榜单');
    await app.waitFor('text:loading:false');
    await app.press('隐藏榜单');
    await app.press('激活榜单');
    expect(path(app, 3)).toBe('');
    await app.press('追加榜单');
    await read(app, 3);
    const ids = params(app, 3).get('shown')!.split(',');
    expect(ids.length).toBe(128);
    expect(new Set(ids).size).toBe(128);
    expect(ids[0]).toBe('23');
    expect(ids[127]).toBe('150');
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
    await app.press('完成榜单末页');
    await app.waitFor('text:cursor:0');
    await app.press('追加榜单');
    expect(path(app, 4)).toBe('');
  });
}
