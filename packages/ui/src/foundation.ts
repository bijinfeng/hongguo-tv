import { token } from 'nsh';

/** Product input/density family, independent of the host operating system. */
export type ProductTarget = 'desktop' | 'tv';

/** The finite sizes shared by ordinary controls; a size is geometry only. */
export type ControlSize = 'sm' | 'md' | 'lg';

/** Token names per control size; the values come from the app's theme file. */
const controlTokens = {
  sm: {
    height: 'control-sm-height',
    fontSize: 'control-sm-font',
    paddingHorizontal: 'control-sm-padding-x',
    paddingVertical: 'control-sm-padding-y',
    gap: 'control-sm-gap',
    radius: 'control-sm-radius',
    iconSize: 'control-sm-icon',
  },
  md: {
    height: 'control-md-height',
    fontSize: 'control-md-font',
    paddingHorizontal: 'control-md-padding-x',
    paddingVertical: 'control-md-padding-y',
    gap: 'control-md-gap',
    radius: 'control-md-radius',
    iconSize: 'control-md-icon',
  },
  lg: {
    height: 'control-lg-height',
    fontSize: 'control-lg-font',
    paddingHorizontal: 'control-lg-padding-x',
    paddingVertical: 'control-lg-padding-y',
    gap: 'control-lg-gap',
    radius: 'control-lg-radius',
    iconSize: 'control-lg-icon',
  },
} as const;

/** Control geometry for one size, read from the current theme. */
export const controlMetrics = (size: ControlSize = 'md') => {
  const names = controlTokens[size];
  return {
    height: token(names.height),
    fontSize: token(names.fontSize),
    paddingHorizontal: token(names.paddingHorizontal),
    paddingVertical: token(names.paddingVertical),
    gap: token(names.gap),
    radius: token(names.radius),
    iconSize: token(names.iconSize),
  };
};

const spaceTokens = {
  none: 'space-none',
  xxs: 'space-xxs',
  xs: 'space-xs',
  sm: 'space-sm',
  md: 'space-md',
  lg: 'space-lg',
  xl: 'space-xl',
  '2xl': 'space-2xl',
  '3xl': 'space-3xl',
} as const;

export type SpaceToken = keyof typeof spaceTokens;

/** One step of the spacing scale in the current theme. */
export const space = (name: SpaceToken) => token(spaceTokens[name]);

const radiusTokens = {
  sm: 'radius-sm',
  md: 'radius-md',
  lg: 'radius-lg',
  xl: 'radius-xl',
  full: 'radius-full',
} as const;

export type RadiusToken = keyof typeof radiusTokens;

/** One step of the corner radius scale in the current theme. */
export const radius = (name: RadiusToken) => token(radiusTokens[name]);

/** Hairline border, always one point. */
export const border = 1;
