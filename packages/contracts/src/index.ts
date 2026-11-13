import type { components } from './generated';

export type Episode = components['schemas']['Episode'];
export type Drama = components['schemas']['Drama'];
export type SearchResult = components['schemas']['SearchResult'];

// Playback, library and account remain migration compatibility types.
export interface PlayInfo {
  path: string;
  vid: string;
  video_codec?: string;
}
export interface Entry {
  drama: Drama;
  episode?: number;
  video_id?: string;
  position?: number;
  duration?: number;
  completed?: boolean;
  last_played_at?: number;
}
export interface Library {
  entries: Entry[];
  owner_id?: string;
}
export interface Account {
  logged_in: boolean;
  profile?: { name: string };
  error?: string;
  qr_login?: { id: string; image?: string; state: string; error?: string };
  qr_login_available?: boolean;
}
export type { paths, components } from './generated';
