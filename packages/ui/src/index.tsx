/** Stable public entry. Internal modules import owners directly, never this barrel. */
export {
  Product,
  uiScale,
  tvUnit,
  controlMetrics,
  type ProductTarget,
  type ControlSize,
} from './foundation';
export { Icon, type IconName, type IconProps } from './icon';
export { Logo } from './branding';
export { Button, IconButton, type ButtonProps, type ButtonVariant } from './button';
export { ContentArrival, Controls } from './layout';
export { SearchInput } from './search-input';
export { CardControls } from './card-controls';
export { SearchPicker, SearchSuggestionRow } from './search-picker';
export { FilterChoices } from './filter-choices';
export { DownloadProgress } from './download-progress';
export * from './form';
export * from './display';
export * from './overlay';
export * from './frequent';
export { Cover, PosterCard, EpisodeRange, ContinueCard, StoryFeature, ResultCard } from './content';
export {
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaControls,
  CinemaText,
  EpisodePanel,
  EpisodeRail,
  CinemaStageAction,
  CinemaSettingRow,
} from './player';
