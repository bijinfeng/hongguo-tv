// Generated from DESIGN.md by tooling/src/design-tokens.mjs. Do not edit; run pnpm design:codegen.
// Sizes live in theme.json / theme.tv.json; this file holds ratios shared by both surfaces.

export const typeTokens = {
  display: {
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacingEm: 0.06,
  },
  page: {
    fontWeight: 600,
    lineHeight: 1.3,
  },
  section: {
    fontWeight: 600,
    lineHeight: 1.5,
  },
  title: {
    fontWeight: 600,
    lineHeight: 1.5,
  },
  'content-title': {
    fontWeight: 600,
    lineHeight: 1.5,
  },
  body: {
    fontWeight: 400,
    lineHeight: 1.5,
  },
  meta: {
    fontWeight: 400,
    lineHeight: 1.5,
  },
  numeric: {
    fontWeight: 400,
    lineHeight: 1.5,
    fontFeature: '"tnum" 1',
  },
} as const;

export type TextRole = keyof typeof typeTokens;
