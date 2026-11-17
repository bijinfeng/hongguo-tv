import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root } from './process.mjs';

const directory = 'design/prototype/visual-redesign-real/assets/component-covers';

/** Fixture covers in the draft's order; optional images fall back to a sibling that exists. */
export async function coverImages(names = ['home', 'night', 'return', 'spring']) {
  const present = (
    await Promise.all(
      names.map((name) =>
        readFile(resolve(root, `${directory}/${name}.jpg`)).catch(() => undefined),
      ),
    )
  ).filter(Boolean);
  if (!present.length)
    throw new Error(
      `No fixture cover images found in ${directory}; acceptance fixtures need at least one`,
    );
  return names.map((_, index) => present[index % present.length]);
}
