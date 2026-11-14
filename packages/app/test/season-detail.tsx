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
      await app.waitFor('text:error:选集加载失败，请重试');
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
}
