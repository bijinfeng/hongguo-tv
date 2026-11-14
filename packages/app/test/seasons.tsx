import { expect, open, test } from 'nsh/test';
import type { Drama } from '@hongguo/core-client';
import { isFinalEpisode } from '../src/seasons';

const episodes = (id: string) => [
  { index: 1, video_id: `${id}1`, locked: false },
  { index: 2, video_id: `${id}2`, locked: false },
];
const drama = (id: string): Drama => ({
  series_id: id,
  title: `作品${id}`,
  cover: '',
  intro: '',
  episode_count: 2,
});

export function registerSeasonsTests(entry = './SeasonsStatePreview.tsx') {
  test('true final episode requires complete exact unlocked identities, not a missing next playable episode', () => {
    const full = { ...drama('100'), episodes: episodes('100') };
    expect(isFinalEpisode(full, full.episodes[1])).toBe(true);
    expect(isFinalEpisode(full, full.episodes[0])).toBe(false);
    expect(isFinalEpisode({ ...full, episode_count: 3 }, full.episodes[1])).toBe(false);
    expect(
      isFinalEpisode(
        {
          ...full,
          episodes: [...full.episodes, { index: 3, video_id: '1003', locked: true }],
          episode_count: 3,
        },
        full.episodes[1],
      ),
    ).toBe(false);
    expect(
      isFinalEpisode({ ...full, episodes: [full.episodes[1], full.episodes[1]] }, full.episodes[1]),
    ).toBe(false);
    expect(isFinalEpisode({ ...full, episode_count: undefined }, full.episodes[1])).toBe(false);
    expect(isFinalEpisode(full, { ...full.episodes[1], video_id: '999' })).toBe(false);
    expect(
      isFinalEpisode(
        { ...full, episodes: [full.episodes[0], { ...full.episodes[1], locked: true }] },
        full.episodes[1],
      ),
    ).toBe(false);
  });
  test('season selector preserves full order, exact selection and original source without media or reservation writes', async () => {
    const app = await open(entry);
    expect(app.texts().some((value) => value.includes('read1:'))).toBe(false);
    await app.press('激活系列');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('read1:/api/v1/series/seasons?series_id=100')),
    );
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('选择预告季');
    await app.waitFor('text:availability:upcoming');
    expect(app.shows('text:source:100')).toBe(true);
    expect(app.shows('text:drama:300')).toBe(true);
    await app.press('选择不可播季');
    await app.waitFor('text:availability:unavailable');
    await app.press('选择第二季');
    await app.waitFor('text:selected:200');
    await app.press('选择第二季');
    await app.press('选择未知季');
    expect(app.shows('text:selected:200')).toBe(true);
    expect(app.texts().some((value) => value.includes('read2:'))).toBe(false);
  });
  test('selector source changes, hiding, background and disposal cancel stale reads independently of abort cooperation', async () => {
    const app = await open(entry);
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.press('切换来源');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('abort1') && value.includes('read2:')),
    );
    await app.press('完成旧首屏');
    expect(app.shows('text:ids:200,100,300,400')).toBe(false);
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort2')));
    await app.press('完成当前');
    await app.setLifecycle('active');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:')));
    await app.press('隐藏系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort3')));
    await app.press('完成当前');
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read4:')));
    await app.press('移除系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort4')));
    await app.press('完成当前');
    expect(app.shows('id:seasons-owner')).toBe(false);
  });
  test('series failures retry explicitly; successor validates exact identity and first video then preserves read-only start result', async () => {
    const app = await open(entry);
    const read = (n: number) =>
      app.waitUntil(() => app.texts().some((value) => value.includes(`read${n}:`)));
    await app.press('激活系列');
    await read(1);
    await app.press('坏系列数据');
    await app.waitFor('seasons-error');
    await app.press('重试系列');
    await read(2);
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await read(3);
    await app.press('完成当前');
    await read(4);
    await app.press('错误身份');
    await app.waitFor('next-error');
    expect(app.shows('text:next:none:none')).toBe(true);
    await app.press('重试下一季');
    await read(5);
    await app.press('完成当前');
    await read(6);
    await app.press('错误首集');
    await app.waitFor('next-error');
    await app.press('重试下一季');
    await read(7);
    await app.press('完成当前');
    await read(8);
    await app.press('锁定首集');
    await app.waitFor('next-error');
    await app.press('重试下一季');
    await read(9);
    await app.press('完成当前');
    await read(10);
    await app.press('完成当前');
    await app.waitFor('text:next:200:2001');
    expect(app.shows('text:selected:100')).toBe(true);
    expect(app.shows('text:source:100')).toBe(true);
  });
  test('manual season choice cancels pending successor detail; background and disposal suppress late continuation', async () => {
    const app = await open(entry);
    const read = (n: number) =>
      app.waitUntil(() => app.texts().some((value) => value.includes(`read${n}:`)));
    await app.press('激活系列');
    await read(1);
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await read(2);
    await app.press('完成当前');
    await read(3);
    await app.press('选择预告季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort3')));
    await app.press('完成旧详情');
    expect(app.shows('text:next:none:none')).toBe(true);
    await app.press('重试下一季');
    expect(app.texts().some((value) => value.includes('read4:'))).toBe(false);
    await app.press('选择原季');
    await app.press('解析下一季');
    await read(4);
    await app.setLifecycle('background');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort4')));
    await app.press('完成当前');
    await app.setLifecycle('active');
    expect(app.texts().some((value) => value.includes('read5:'))).toBe(false);
    await app.press('解析下一季');
    await read(5);
    await app.press('移除系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('abort5')));
    await app.press('完成当前');
    expect(app.shows('id:seasons-owner')).toBe(false);
    expect(app.texts().some((value) => value.includes('read6:'))).toBe(false);
  });
  test('fallback relation only identifies current number; null cannot override complete selector and duplicate intents share one request', async () => {
    const app = await open(entry);
    const read = (n: number) =>
      app.waitUntil(() => app.texts().some((value) => value.includes(`read${n}:`)));
    await app.press('激活系列');
    await read(1);
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await read(2);
    await app.press('解析下一季');
    expect(app.texts().some((value) => value.includes('read3:'))).toBe(false);
    await app.press('无下一季');
    await read(3);
    await app.press('完成当前');
    await app.waitFor('text:next:200:2001');
    expect(app.shows('next-error')).toBe(false);
    await app.press('取消下一季');
    await app.waitFor('text:next:none:none');
    await app.press('重试下一季');
    expect(app.texts().some((value) => value.includes('read4:'))).toBe(false);
  });

  test('series failures use shared safe copy while retaining retryable error categories', async () => {
    const app = await open(entry);
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.press('敏感错误当前');
    await app.waitFor('text:seasons-message:系列加载失败，请重试');
    expect(app.texts().some((value) => /internal\.fixture|never-expose/.test(value))).toBe(false);
    await app.press('重试系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:')));
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read3:')));
    await app.press('超时错误当前');
    await app.waitFor('text:next-message:下一季加载失败：内容服务连接超时，请重试');
    expect(app.texts().some((value) => /internal\.fixture|never-expose/.test(value))).toBe(false);
    expect(app.shows('text:next:none:none')).toBe(true);
  });

  test('source replacement cancels a pending successor relation before its late response can request detail', async () => {
    const app = await open(entry);
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read1:')));
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await app.waitUntil(() => app.texts().some((value) => value.includes('read2:')));
    await app.press('切换来源');
    await app.waitUntil(() =>
      app.texts().some((value) => value.includes('abort2') && value.includes('read3:')),
    );
    await app.press('完成旧关系');
    expect(app.shows('text:source:900')).toBe(true);
    expect(app.shows('text:next:none:none')).toBe(true);
    expect(app.texts().some((value) => value.includes('read4:'))).toBe(false);
    expect(app.texts().some((value) => value.includes('/series/detail?'))).toBe(false);
  });
  test('known current number uses only adjacent selector detail and rejects mismatched content type', async () => {
    const app = await open(entry);
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((v) => v.includes('read1:')));
    await app.press('系列:known');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await app.waitUntil(() =>
      app.texts().some((v) => v.includes('read2:/api/v1/series/detail?series_id=200')),
    );
    expect(app.texts().some((v) => v.includes('/next-season?'))).toBe(false);
    await app.press('错误类型');
    await app.waitFor('next-error');
    expect(app.shows('text:next:none:none')).toBe(true);
    await app.press('重试下一季');
    await app.waitUntil(() =>
      app.texts().some((v) => v.includes('read3:/api/v1/series/detail?series_id=200')),
    );
    await app.press('完成当前');
    await app.waitFor('text:next:200:2001');
  });

  for (const mode of [
    'upcoming',
    'unavailable',
    'gap',
    'duplicate-next',
    'duplicate-current',
    'last',
  ]) {
    test(`adjacent selector ${mode} never skips or starts a season`, async () => {
      const app = await open(entry);
      await app.press('激活系列');
      await app.waitUntil(() => app.texts().some((v) => v.includes('read1:')));
      await app.press(`系列:${mode}`);
      await app.waitFor('text:loading:false');
      await app.press('解析下一季');
      await app.waitFor('text:next-loading:false');
      expect(app.shows('text:next:none:none')).toBe(true);
      expect(app.texts().some((v) => v.includes('read2:'))).toBe(false);
      if (['gap', 'duplicate-next', 'duplicate-current'].includes(mode)) {
        expect(app.shows('next-error')).toBe(true);
      } else {
        expect(app.shows('next-error')).toBe(false);
        await app.waitFor(
          `text:next-status:${mode === 'upcoming' ? '本季已播放完，下一季待上线。' : mode === 'unavailable' ? '下一季暂不可观看。' : '本季已播放完，暂无下一季。'}`,
        );
      }
    });
  }

  test('visible inactive browsing completes but relation and successor detail continuation require active foreground', async () => {
    const app = await open(entry);
    const read = (n: number) =>
      app.waitUntil(() => app.texts().some((v) => v.includes(`read${n}:`)));
    const aborted = (n: number) =>
      app.waitUntil(() => app.texts().some((v) => v.includes(`abort${n}`)));
    await app.press('激活系列');
    await read(1);
    await app.setLifecycle('inactive');
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    expect(app.texts().some((v) => v.includes('abort1'))).toBe(false);
    await app.press('解析下一季');
    expect(app.texts().some((v) => v.includes('read2:'))).toBe(false);
    await app.setLifecycle('active');
    await app.press('解析下一季');
    await read(2);
    await app.setLifecycle('inactive');
    await aborted(2);
    await app.press('完成旧关系');
    expect(app.texts().some((v) => v.includes('read3:'))).toBe(false);
    await app.setLifecycle('active');
    expect(app.texts().some((v) => v.includes('read3:'))).toBe(false);
    await app.press('解析下一季');
    await read(3);
    await app.press('完成当前');
    await read(4);
    await app.setLifecycle('inactive');
    await aborted(4);
    await app.press('完成当前');
    await app.setLifecycle('active');
    expect(app.shows('text:next:none:none')).toBe(true);
    expect(app.texts().some((v) => v.includes('read5:'))).toBe(false);
  });

  test('same series with new content type cancels ownership and rejects old selector completion', async () => {
    const app = await open(entry);
    await app.press('激活系列');
    await app.waitUntil(() => app.texts().some((v) => v.includes('read1:')));
    await app.press('切换来源类型');
    await app.waitUntil(() =>
      app.texts().some((v) => v.includes('abort1') && v.includes('read2:')),
    );
    await app.press('完成旧首屏');
    expect(app.shows('text:ids:200,100,300,400')).toBe(false);
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    expect(app.shows('text:source-type:drama')).toBe(true);
    expect(app.shows('text:drama-type:drama')).toBe(true);
  });
  test('confirming the already selected season cancels pending relation and detail without changing selection', async () => {
    const app = await open(entry);
    const read = (n: number) =>
      app.waitUntil(() => app.texts().some((v) => v.includes(`read${n}:`)));
    await app.press('激活系列');
    await read(1);
    await app.press('完成当前');
    await app.waitFor('text:ids:200,100,300,400');
    await app.press('解析下一季');
    await read(2);
    await app.press('选择原季');
    await app.waitUntil(() => app.texts().some((v) => v.includes('abort2')));
    await app.press('完成当前');
    expect(app.shows('text:selected:100')).toBe(true);
    expect(app.texts().some((v) => v.includes('read3:'))).toBe(false);
    await app.press('解析下一季');
    await read(3);
    await app.press('完成当前');
    await read(4);
    await app.press('选择原季');
    await app.waitUntil(() => app.texts().some((v) => v.includes('abort4')));
    await app.press('完成当前');
    await app.waitFor('text:next-loading:false');
    expect(app.shows('text:next:none:none')).toBe(true);
    await app.press('重试下一季');
    expect(app.texts().some((v) => v.includes('read5:'))).toBe(false);
  });
}
