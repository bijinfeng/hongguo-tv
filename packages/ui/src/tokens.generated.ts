// Generated from DESIGN.md by tooling/src/design-tokens.mjs. Do not edit; run pnpm design:codegen.
// Sizes live in theme.json / theme.tv.json; this file holds ratios shared by both surfaces.

export const typeTokens = {
  display: {
    fontWeight: 500,
    lineHeight: 1.15,
    letterSpacingEm: -0.01,
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
    lineHeight: 1.6,
  },
  meta: {
    fontWeight: 400,
    lineHeight: 1.5,
  },
  caption: {
    fontWeight: 400,
    lineHeight: 1.4,
  },
  numeric: {
    fontWeight: 400,
    lineHeight: 1.5,
    fontFeature: '"tnum" 1',
  },
} as const;

export type TextRole = keyof typeof typeTokens;
