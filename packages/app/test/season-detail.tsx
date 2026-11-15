import { expect, open, test } from 'nsh/test';
import { seasonEpisode } from '../src/season-detail';

export function registerSeasonDetailTests(entry = './SeasonDetailPreview.tsx') {
  test('episode membership requires exact unique unlocked video and index within the verified owner', () => {
    const episode = { index: 1, video_id: '1001', locked: false };
    const drama = { series_id: '100', title: '', cover: '', intro: '', episodes: [episode] };
    expect(seasonEpisode(drama, { ...episode })).toEqual(episode);
    expect(seasonEpisode(drama, { ...episode, index: 2 })).toBe(undefined);
    expect(seasonEpisode(drama, { ...episode, video_id: '2001' })).toBe(undefined);
    expect(seasonEpisode(drama, { ...episode, locked: true })).toBe(undefined);
    expect(seasonEpisode({ ...drama, episodes: [{ ...episode, locked: true }] }, episode)).toBe(
      undefined,
    );
    expect(seasonEpisode({ ...drama, episodes: [episode, episode] }, episode)).toBe(undefined);
    expect(
      seasonEpisode({ ...drama, episodes: [episode, { ...episode, video_id: '1002' }] }, episode),
    ).toBe(undefined);
    expect(seasonEpisode({ ...drama, series_id: '0' }, episode)).toBe(undefined);
    expect(seasonEpisode(undefined, episode)).toBe(undefined);
  });

  test('browsing caches only validated current details and never reads upcoming or unavailable selections', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitFor('text:availability:playable');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:1')));
    await app.press('返回空元数据');
    await app.waitFor('text:detail:100:1');
    expect(app.shows('text:summary-title:作品100')).toBe(true);
    await app.press('浏览第二季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:200:1')));
    expect(app.shows('text:detail:none:none')).toBe(true);
    expect(app.shows('text:summary:200')).toBe(true);
    await app.press('完成当前详情');
    await app.waitFor('text:detail:200:1');
    await app.press('浏览原季');
    await app.waitFor('text:detail:100:1');
    await app.press('浏览预告季');
    await app.waitFor('text:availability:upcoming');
    expect(app.shows('text:episodes:none')).toBe(true);
    expect(app.shows('text:summary:300')).toBe(true);
    await app.press('重试详情');
    await app.press('浏览不可播季');
    await app.waitFor('text:availability:unavailable');
    expect(app.shows('text:episodes:none')).toBe(true);
    await app.press('重试详情');
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });

  test('a late previous selection cannot display or seed the cache even when abort is ignored', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitFor('text:availability:playable');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.press('浏览第二季');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('abort1') && value.includes('read2:')),
    );
    await app.press('完成旧详情');
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.press('完成当前详情');
    await app.waitFor('text:detail:200:1');
    await app.press('浏览原季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:100:1')));
    expect(app.shows('text:detail:none:none')).toBe(true);
  });

  test('season metadata enriches an unknown type without aborting or replacing its pending detail', async () => {
    const app = await open(entry);
    await app.press('使用缺类型来源');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
    expect(app.shows('text:selected-type:none')).toBe(true);
    expect(app.shows('text:loading:true')).toBe(true);
    await app.press('补全原季类型');
    await app.waitFor('text:selected-type:1004');
    expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
    expect(app.shows('text:loading:true')).toBe(true);
    await app.press('完成补全类型详情');
    await app.waitFor('text:detail:100:1004');
    expect(app.shows('text:episodes:1001,1002')).toBe(true);
    expect(app.shows('text:metadata:0:0')).toBe(true);
    expect(app.shows('text:loading:false')).toBe(true);
    expect(app.shows('text:error:')).toBe(true);
    await app.press('重试详情');
    expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
  });

  test('season metadata enriches an unknown type without discarding already validated detail', async () => {
    const app = await open(entry);
    await app.press('使用缺类型来源');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
    await app.press('完成补全类型详情');
    await app.waitFor('text:detail:100:1004');
    expect(app.shows('text:selected-type:none')).toBe(true);
    await app.press('补全原季类型');
    await app.waitFor('text:selected-type:1004');
    expect(app.shows('text:detail:100:1004')).toBe(true);
    expect(app.shows('text:episodes:1001,1002')).toBe(true);
    expect(app.shows('text:metadata:0:0')).toBe(true);
    expect(app.shows('text:loading:false')).toBe(true);
    await app.press('重试详情');
    expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
  });

  test('an unknown request still rejects detail that conflicts with its enriched selected type', async () => {
    const app = await open(entry);
    await app.press('使用缺类型来源');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
    await app.press('补全原季类型');
    await app.waitFor('text:selected-type:1004');
    expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
    await app.press('错误内容类型');
    await app.waitFor('text:error:详情加载失败，请重试');
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.press('重试详情');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:100:1004')));
    await app.press('完成补全类型详情');
    await app.waitFor('text:detail:100:1004');
    expect(app.shows('text:error:')).toBe(true);
  });

  test('enrichment rereads a known type when the previously completed unknown request cached a conflicting type', async () => {
    const app = await open(entry);
    await app.press('使用缺类型来源');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
    await app.press('完成类型一详情');
    await app.waitFor('text:detail:100:1');
    expect(app.shows('text:selected-type:none')).toBe(true);
    await app.press('补全原季类型');
    await app.waitFor('text:selected-type:1004');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:100:1004')));
    expect(app.shows('text:detail:none:none')).toBe(true);
    expect(app.shows('text:metadata:unread')).toBe(true);
    expect(app.shows('text:loading:true')).toBe(true);
    await app.press('完成补全类型详情');
    await app.waitFor('text:detail:100:1004');
    expect(app.shows('text:metadata:0:0')).toBe(true);
    expect(app.shows('text:error:')).toBe(true);
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
  });

  test('a later explicit season type change aborts the refined request and rejects its late matching response', async () => {
    const app = await open(entry);
    await app.press('使用缺类型来源');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
    await app.press('补全原季类型');
    await app.waitFor('text:selected-type:1004');
    expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
    await app.press('重读系列元数据');
    await app.press('原季元数据改为类型一');
    await app.waitFor('text:selected-type:1');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('abort1') && value.includes('read2:100:1')),
    );
    await app.press('完成旧类型一详情');
    expect(app.shows('text:detail:none:none')).toBe(true);
    expect(app.shows('text:metadata:unread')).toBe(true);
    expect(app.shows('text:loading:true')).toBe(true);
    await app.press('完成类型一详情');
    await app.waitFor('text:detail:100:1');
    expect(app.shows('text:metadata:0:0')).toBe(true);
    expect(app.shows('text:error:')).toBe(true);
    await app.press('重试详情');
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
  });

  test('type enrichment preserves source replacement and season selection fences for late detail', async () => {
    for (const [action, id] of [
      ['切换来源', '900'],
      ['浏览第二季', '200'],
    ]) {
      const app = await open(entry);
      await app.press('使用缺类型来源');
      await app.press('激活浏览');
      await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:')));
      await app.press('补全原季类型');
      await app.waitFor('text:selected-type:1004');
      expect(app.texts().some((value) => /abort1|read2:/.test(value))).toBe(false);
      await app.press(action);
      await app.waitUntil(() =>
        app.texts().some((value) => value.includes('abort1') && value.includes(`read2:${id}:1`)),
      );
      await app.press('完成旧详情');
      expect(app.shows('text:detail:none:none')).toBe(true);
      await app.press('完成当前详情');
      await app.waitFor(`text:detail:${id}:1`);
      expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
      app.dispose();
    }
  });

  test('source replacement fences old detail writes and content types have separate cache identities', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:1')));
    await app.press('切换来源');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('abort1') && value.includes('read2:900:1')),
    );
    await app.press('完成旧详情');
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.press('完成当前详情');
    await app.waitFor('text:detail:900:1');
    await app.press('返回原来源');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:100:1')));
    await app.press('完成当前详情');
    await app.waitFor('text:detail:100:1');
    await app.press('切换来源');
    await app.waitFor('text:detail:900:1');
    await app.press('更换内容类型');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read4:100:2')));
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.press('省略内容类型');
    await app.waitFor('text:detail:100:2');
    await app.press('切换来源');
    await app.waitFor('text:detail:900:1');
    await app.press('返回原来源');
    await app.waitFor('text:detail:100:1');
    expect(app.texts().some((value) => value.includes('read5:'))).toBe(false);
  });

  test('visible inactive detail reads finish; background cancels and rereads without accepting the late result', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.setLifecycle('inactive');
    await app.press('完成当前详情');
    await app.waitFor('text:detail:100:1');
    expect(app.texts().some((value) => value.includes('abort1'))).toBe(false);
    await app.setLifecycle('active');
    await app.waitFor('text:availability:playable');
    await app.press('浏览第二季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:')));
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort2')));
    await app.press('完成当前详情');
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.setLifecycle('active');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:200:1')));
    await app.press('完成当前详情');
    await app.waitFor('text:detail:200:1');
  });

  test('hidden and disposed detail owners reject late reads and resume only uncached current detail', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.press('隐藏浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort1')));
    await app.press('完成当前详情');
    expect(app.shows('text:detail:none:none')).toBe(true);
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:')));
    await app.press('移除浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort2')));
    await app.press('完成当前详情');
    expect(app.shows('id:season-detail-owner')).toBe(false);
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
  });

  test('invalid identity, type and episode data remain retryable and arbitrary errors are never shown', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    for (const [index, action] of [
      '错误详情身份',
      '错误内容类型',
      '重复选集',
      '非法选集',
      '敏感详情错误',
    ].entries()) {
      await app.waitUntil(() => app.texts().some((value) => value.includes(`read${index + 1}:`)));
      await app.press(action);
      await app.waitFor('text:error:详情加载失败，请重试');
      expect(app.shows('text:detail:none:none')).toBe(true);
      expect(app.texts().some((value) => /internal\.fixture|never-expose/.test(value))).toBe(false);
      await app.press('重试详情');
    }
    await app.waitUntil(() => app.texts().some((value) => value.includes('read6:')));
    await app.press('完成当前详情');
    await app.waitFor('text:detail:100:1');
    expect(app.shows('text:error:')).toBe(true);
  });

  test('already supplied validated details are reused without a redundant detail or side-effect read', async () => {
    const app = await open(entry);
    await app.press('使用已有详情');
    await app.press('激活浏览');
    await app.waitFor('text:detail:900:1');
    expect(app.shows('text:episodes:9001,9002')).toBe(true);
    expect(app.texts().some((value) => value.includes('read1:'))).toBe(false);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });

  test('supplied episodes remain usable while metadata is read once, retries, and caches complete empty extras', async () => {
    const app = await open(entry);
    await app.press('仅提供已有选集');
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:900:1')));
    expect(app.shows('text:episodes:9001,9002')).toBe(true);
    expect(app.shows('text:metadata:unread')).toBe(true);
    await app.press('敏感详情错误');
    await app.waitFor('text:error:详情加载失败，请重试');
    expect(app.shows('text:episodes:9001,9002')).toBe(true);
    await app.press('重试详情');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:900:1')));
    await app.press('完成当前详情');
    await app.waitFor('text:metadata:0:0');
    await app.press('隐藏浏览');
    await app.press('激活浏览');
    await app.press('重试详情');
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
    expect(app.shows('text:episodes:9001,9002')).toBe(true);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });

  test('detail-only metadata preserves exact identities and is cached separately for a new source', async () => {
    const app = await open(entry);
    await app.press('激活浏览');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:100:1')));
    await app.press('完成扩展详情');
    await app.waitFor('text:metadata:2:1');
    expect(app.shows('text:actor-ids:9007199254740993,none')).toBe(true);
    expect(app.shows('text:related-ids:9007199254740992')).toBe(true);
    await app.press('浏览第二季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:200:1')));
    expect(app.shows('text:metadata:unread')).toBe(true);
    await app.press('完成扩展详情');
    await app.waitFor('text:metadata:2:1');
    await app.press('独立浏览第二季来源');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:200:1')));
    expect(app.shows('text:metadata:unread')).toBe(true);
    await app.press('非法扩展详情');
    await app.waitFor('text:error:详情加载失败，请重试');
    await app.press('重试详情');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read4:200:1')));
    await app.press('完成当前详情');
    await app.waitFor('text:metadata:0:0');
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });

  test('supplied complete metadata follows core normalization without unsafe links, duplicate keys or episode payloads', async () => {
    const app = await open(entry);
    await app.press('提供需归一的完整详情');
    await app.press('激活浏览');
    await app.waitFor('text:metadata:3:2');
    expect(app.shows('text:actor-ids:9007199254740993,none,none')).toBe(true);
    expect(app.shows('text:actor-avatars:||')).toBe(true);
    expect(app.shows('text:related-ids:901,904')).toBe(true);
    expect(app.shows('text:related-episodes:none')).toBe(true);
    expect(app.texts().some((value) => value.includes('read1:'))).toBe(false);
    expect(app.requests()).toEqual([]);
    expect(app.audio()).toEqual([]);
  });

  test('oversized supplied actors, related rows and related episode counts require a validated read', async () => {
    for (const action of ['提供超量演员详情', '提供超量相关详情', '提供超大相关集数']) {
      const app = await open(entry);
      await app.press(action);
      await app.press('激活浏览');
      await app.waitUntil(() => app.texts().some((value) => value.includes('read1:900:1')));
      expect(app.shows('text:metadata:unread')).toBe(true);
      expect(app.shows('text:episodes:9001,9002')).toBe(true);
      await app.press('完成扩展详情');
      await app.waitFor('text:metadata:2:1');
      expect(app.requests()).toEqual([]);
      expect(app.audio()).toEqual([]);
      app.dispose();
    }
  });
}
