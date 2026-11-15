import { expect, test } from 'nsh/test';
import { libraryDrama, type Drama } from '@hongguo/core-client';

export function registerLibraryTests() {
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
