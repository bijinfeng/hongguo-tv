import { Product, tvUnit } from './foundation';

/** Finite text roles shared by standalone text and content compositions. */
export type TextRole = 'page' | 'section' | 'title' | 'content-title' | 'body' | 'meta' | 'numeric';
const sizes = {
  desktop: {
    page: 32,
    section: 24,
    title: 20,
    'content-title': 18,
    body: 16,
    meta: 14,
    numeric: 16,
  },
  tv: { page: 48, section: 32, title: 24, 'content-title': 24, body: 22, meta: 20, numeric: 22 },
};

/** Internal metrics; callers read inside bindings so product density stays reactive. */
export const textSize = (role: TextRole = 'body') =>
  Product() === 'tv' ? tvUnit(sizes.tv[role]) : sizes.desktop[role];
