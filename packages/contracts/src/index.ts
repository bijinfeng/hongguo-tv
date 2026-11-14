import type { components } from './generated';

export type Episode = components['schemas']['Episode'];
export type Drama = components['schemas']['Drama'];
export type SearchHistory = components['schemas']['SearchHistory'];
export type SearchHistoryChange = components['schemas']['SearchHistoryChange'];
export type SearchResult = components['schemas']['SearchResult'];
export type SearchSuggestions = components['schemas']['SearchSuggestions'];
export type SearchSuggestion = components['schemas']['SearchSuggestion'];
export type SuggestionKind = components['schemas']['SuggestionKind'];
export type SearchDiscovery = components['schemas']['SearchDiscovery'];
export type DiscoveryItem = components['schemas']['DiscoveryItem'];
export type DiscoveryBoard = components['schemas']['DiscoveryBoard'];
export type DiscoveryBoardKind = components['schemas']['DiscoveryBoardKind'];
export type Entry = components['schemas']['Entry'];
export type Library = components['schemas']['Library'];
export type HistoryChange = components['schemas']['HistoryChange'];

export type PlayInfo = components['schemas']['PlayInfo'];

// Account remains a migration compatibility type.
export interface Account {
  logged_in: boolean;
  profile?: { name: string };
  error?: string;
  qr_login?: { id: string; image?: string; state: string; error?: string };
  qr_login_available?: boolean;
}
export type { paths, components } from './generated';
