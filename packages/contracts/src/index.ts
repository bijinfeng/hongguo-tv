// Compatibility DTOs for the migration reference; new Rust endpoints use generated.ts.
export interface Episode {
  index: number;
  video_id: string;
  title?: string;
  locked: boolean;
}
export interface Drama {
  series_id: string;
  title: string;
  cover: string;
  cover_fallback?: string;
  intro: string;
  episode_count?: number;
  content_type?: string;
  episodes?: Episode[];
  tags?: string[];
}
export interface SearchResult {
  items: Drama[];
  has_more: boolean;
  next_offset: number;
}
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
