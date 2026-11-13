import type { components } from './generated';

export type Episode = components['schemas']['Episode'];
export type Drama = components['schemas']['Drama'];
export type SearchResult = components['schemas']['SearchResult'];
export type Entry = components['schemas']['Entry'];
export type Library = components['schemas']['Library'];
export type HistoryChange = components['schemas']['HistoryChange'];

// Playback and account remain migration compatibility types.
export interface PlayInfo {
  path: string;
  vid: string;
  video_codec?: string;
}
export interface Account {
  logged_in: boolean;
  profile?: { name: string };
  error?: string;
  qr_login?: { id: string; image?: string; state: string; error?: string };
  qr_login_available?: boolean;
}
export type { paths, components } from './generated';
