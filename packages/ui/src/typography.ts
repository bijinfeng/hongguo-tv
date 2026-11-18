import { token } from 'nsh';
import { typeTokens, type TextRole } from './tokens.generated';

export type { TextRole };

type TypeRatios = { fontWeight: number; lineHeight: number; letterSpacingEm?: number };

const ratios: Record<TextRole, TypeRatios> = typeTokens;

const textTokens = {
  display: 'text-display',
  page: 'text-page',
  section: 'text-section',
  title: 'text-title',
  'content-title': 'text-content-title',
  body: 'text-body',
  meta: 'text-meta',
  numeric: 'text-numeric',
} as const;

/** Font size for one text role in the current theme. */
export const textSize = (role: TextRole = 'body'): number => token(textTokens[role]);

/** Line height for one text role, derived from its size and ratio. */
export const textLineHeight = (role: TextRole = 'body'): number =>
  textSize(role) * ratios[role].lineHeight;

/** Font weight for one text role. */
export const textWeight = (role: TextRole = 'body'): number => ratios[role].fontWeight;

/** Letter spacing for one text role, in points. */
export const textLetterSpacing = (role: TextRole = 'body'): number | undefined => {
  const ratio = ratios[role].letterSpacingEm;
  return ratio === undefined ? undefined : textSize(role) * ratio;
};
