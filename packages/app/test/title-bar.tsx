import { expect, open, test } from 'nsh/test';

/**
 * The title bar contract that can be checked without a real window: one shared height, and no
 * reserved width when the platform reports no window controls (a browser, or a system title bar
 * still visible). The bar itself is native, so dragging and control hit areas are verified on a
 * real host instead.
 */
export function registerTitleBarTests(entry = './TitleBarStatePreview.tsx') {
  test('title bar keeps one height and reserves nothing when no controls are reported', async () => {
    const app = await open(entry, {
      platform: 'web',
      width: 1180,
      height: 780,
      colorScheme: 'light',
      reducedMotion: true,
      network: {},
    });
    expect(app.shows('id:titlebar-brand')).toBe(true);
    const texts = app.texts();
    expect(texts).toContain('48');
    expect(texts.filter((text) => text === '0').length).toBe(2);
    app.dispose();
  });

  test('title bar renders the same content row in both themes', async () => {
    for (const colorScheme of ['light', 'dark'] as const) {
      const app = await open(entry, {
        platform: 'web',
        width: 1180,
        height: 780,
        colorScheme,
        reducedMotion: true,
        network: {},
      });
      expect(app.shows('id:titlebar-content')).toBe(true);
      expect(app.texts()).toContain('48');
      app.dispose();
    }
  });
}
