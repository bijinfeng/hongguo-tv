import { platform, token, type BoxShadowLayer } from 'nsh';
import { textLineHeightRatio } from './typography';

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

/**
 * Control geometry for one size, read from the current theme.
 *
 * `lineHeight` comes with `fontSize` on purpose: a control's label is text like any other, and
 * measuring only its size lets the line box fall back to the host default. Measured on the web
 * host that default is about 1.14x, against the 1.5 the type roles declare — a 14pt label stood
 * 16pt tall instead of 21, so the same label was a different height inside a control than in a
 * `UiText`. Every label drawn from these metrics takes both.
 */
export const controlMetrics = (size: ControlSize = 'md') => {
  const names = controlTokens[size];
  const fontSize = token(names.fontSize);
  return {
    height: token(names.height),
    fontSize,
    lineHeight: Math.round(fontSize * textLineHeightRatio('body')),
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

/**
 * Depth for anything that floats above the page: menus, popovers, dialogs, sheets.
 * Two layers, because one reads as a smudge: a tight layer for the contact edge and a
 * wide soft one for the lift. Colour stays the platform's black with alpha, so it works
 * on either theme without a second token.
 */
export const overlayShadow: BoxShadowLayer[] = [
  { x: 0, y: 2, blur: 6, color: 'rgba(0, 0, 0, 0.18)' },
  { x: 0, y: 12, blur: 32, color: 'rgba(0, 0, 0, 0.28)' },
];

/** Independent focus outline, two hairline units. */
export const focusRing = border * 2;

/** Focus outline of a field sits just outside its border. */
export const focusOffset = border * 3;

/** A field already inside a border keeps its focus outline in place of that border. */
export const focusOffsetInside = -border;

/**
 * Android TV's remote adapter owns one indicator in each native window. An explicit zero
 * outline also mutes NSH's fallback when modal keys reach its native key dispatcher.
 * Desktop and web controls own their CSS focus indicator.
 */
export function focusRingClass(offset?: 2 | 4, tone: 'ring' | 'cinema-focus' = 'ring') {
  if (platform.os === 'android') return 'focus-visible:outline-0';
  const width = 'focus-visible:outline-2 focus-visible:outline-' + tone;
  return offset === undefined ? width : `${width} focus-visible:outline-offset-${offset}`;
}

/** Same as `focusRingClass` for a container lit up by its focused child. */
export function focusWithinClass(offset?: 2 | 4, tone: 'ring' | 'cinema-focus' = 'ring') {
  if (platform.os === 'android') return 'focus-within:outline-0';
  const width = 'focus-within:outline-2 focus-within:outline-' + tone;
  return offset === undefined ? width : `${width} focus-within:outline-offset-${offset}`;
}

/** The two label weights the type scale defines. */
export const weight = {
  regular: () => Number(token('font-regular')),
  strong: () => Number(token('font-strong')),
} as const;
