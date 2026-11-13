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
    };
    const saved = libraryDrama(detail as Drama);
    expect(JSON.stringify({ action: 'progress', drama: saved }).length < 32768).toBe(true);
    expect(saved.episodes).toBe(undefined);
    expect(detail.episodes.length).toBe(1000);
  });
}
