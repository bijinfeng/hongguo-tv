import type { App } from 'nsh/test';

/** Exercises the public TV hierarchy; desktop keeps its direct library rail. */
export async function openHistory(app: App, target: 'desktop' | 'tv') {
  if (target === 'desktop') return app.press('id:nav-history');
  for (let depth = 0; depth < 4 && !app.shows('id:nav-mine'); depth++) await app.back();
  await app.press('id:nav-mine');
  await app.press('id:mine-history');
}

export async function openAccount(app: App, target: 'desktop' | 'tv', name = '登录') {
  if (target === 'desktop') return app.press(`label:账号与记录 >> role:button[${name}]`);
  for (let depth = 0; depth < 4 && !app.shows('id:nav-mine'); depth++) await app.back();
  await app.press('id:nav-mine');
  await app.press('id:mine-account');
}
