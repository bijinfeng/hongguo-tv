import { windowSize } from 'nsh';
import { Product, tvUnit } from './foundation';

/** Finite text roles shared by standalone text and content compositions. */
export type TextRole =
  | 'display'
  | 'page'
  | 'section'
  | 'title'
  | 'content-title'
  | 'body'
  | 'meta'
  | 'numeric';
const sizes = {
  desktop: {
    display: 44,
    page: 32,
    section: 24,
    title: 20,
    'content-title': 18,
    body: 16,
    meta: 14,
    numeric: 16,
  },
  tv: {
    display: 78,
    page: 48,
    section: 32,
    title: 24,
    'content-title': 24,
    body: 22,
    meta: 20,
    numeric: 22,
  },
};

/** Draft hero headline: scales between 38 and 56 on desktop, fixed reference size on TV. */
const displaySize = () => Math.min(56, Math.max(38, windowSize().width * 0.037));

/** Internal metrics; callers read inside bindings so product density stays reactive. */
export const textSize = (role: TextRole = 'body') =>
  Product() === 'tv'
    ? tvUnit(sizes.tv[role])
    : role === 'display'
      ? displaySize()
      : sizes.desktop[role];
