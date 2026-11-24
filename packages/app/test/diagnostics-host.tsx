import { expect, open, test } from 'nsh/test';

/**
 * The device half of the diagnostics contract: the app must hand the host one sanitized
 * event per failure, and nothing at all while the user has not agreed to reporting.
 *
 * These run against the real category state, not a mock: the failure is the same one the
 * product path produces, so a regression in the call site shows up here.
 */
export function registerDiagnosticsHostTests() {
  const agree = async (app: Awaited<ReturnType<typeof open>>) => {
    await app.press('激活分类');
    // The fixture's switch flips the same consent signal the settings row binds, so the report
    // sites read it exactly as they do in the product.
    await app.press('发送诊断数据');
  };

  test('diagnostics: no report leaves the app before the user agrees', async () => {
    const app = await open('./CategoryStatePreview.tsx', {
      host: { handlers: { 'diagnostics.consent': true, 'diagnostics.report': null } },
    });
    await app.press('激活分类');
    await app.press('失败当前');
    await app.waitFor('category-error');
    // The failure is visible and handled, but the host received nothing.
    expect(app.host.posts().some((p) => p.name === 'diagnostics.report')).toBe(false);
  });

  test('diagnostics: an agreed user gets one sanitized report per failure', async () => {
    const app = await open('./CategoryStatePreview.tsx', {
      host: { handlers: { 'diagnostics.consent': true, 'diagnostics.report': () => undefined } },
    });
    await agree(app);
    await app.press('失败当前');
    await app.waitFor('category-error');
    await app.waitUntil(() => app.host.posts().some((p) => p.name === 'diagnostics.report'));
    const posts = app.host.posts().filter((p) => p.name === 'diagnostics.report');
    expect(posts.length).toBe(1);
    const event = posts[0].data as Record<string, unknown>;
    expect(event.category).toBe('catalog');
    expect(event.operation).toBe('加载分类');
    // Nothing identifying rides along: no URL, no token, no account.
    const serialized = JSON.stringify(event);
    expect(serialized.includes('http://')).toBe(false);
    expect(serialized.includes('sign=')).toBe(false);
    expect(serialized.includes('/api/v1/')).toBe(false);
    // The visible recovery path is unchanged by reporting.
    expect(app.shows('category-error')).toBe(true);
  });
}
