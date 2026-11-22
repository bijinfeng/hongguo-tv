/** Stable public entry. Internal modules import owners directly, never this barrel. */
export {
  border,
  controlMetrics,
  focusRing,
  radius,
  space,
  weight,
  type ProductTarget,
  type ControlSize,
  type RadiusToken,
  type SpaceToken,
} from './foundation';
export { Icon, type IconName, type IconProps } from './icon';
export { Logo } from './branding';
export { Button, IconButton, type ButtonProps, type ButtonVariant } from './button';
export { ActionRow, type ActionRowProps } from './action-row';
export { BackButton, type BackButtonProps, type BackButtonTone } from './back-button';
export { ContentArrival, Controls } from './layout';
export { SearchInput, type SearchInputProps } from './search-input';
export { CardControls, CardRoot } from './card-controls';
export { SearchPicker, SearchSuggestionRow } from './search-picker';
export { FilterChoices } from './filter-choices';
export { DownloadProgress, type DownloadProgressProps } from './download-progress';
export * from './text-input';
export * from './field';
export * from './choice';
export * from './select';
export * from './checkbox';
export * from './switch';
export * from './choice-group';
export * from './tabs';
export * from './slider';
export * from './display';
export * from './overlay';
export * from './frequent';
export * from './settings-row';
export * from './settings-section';
export { DateChoice, type DateChoiceProps } from './date-choice';
export { RankingCard, type RankingCardProps } from './ranking-card';
export {
  RadarTable,
  type RadarTableProps,
  type RadarTableRef,
  type RadarTableColumn,
  type RadarTableRow,
} from './radar-table';
export { SeasonChoice, type SeasonChoiceProps } from './season-choice';
export { Pagination, type PaginationProps } from './pagination';
export {
  Cover,
  type CoverProps,
  PosterCard,
  EpisodeRange,
  ContinueCard,
  StoryFeature,
  ResultCard,
} from './content';
export {
  CinemaButton,
  CinemaEpisodeButton,
  CinemaSlider,
  CinemaSelect,
  CinemaControls,
  CinemaText,
  CinemaStage,
  EpisodePanel,
  EpisodeRail,
  CinemaStageAction,
  CinemaSettingRow,
} from './player';
