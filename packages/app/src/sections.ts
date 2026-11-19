import type { Route, Section } from './store';

/** Product names of the browse sections; the topbar crumb and the back entries share them. */
export const sectionLabels: Record<Section, string> = {
  home: '发现',
  discover: '找剧',
  search: '找剧',
  history: '观看记录',
  following: '追更',
  reservations: '预约',
  notifications: '更新提醒',
  rankings: '排行榜',
  calendar: '上新日历',
};

/** The page a stacked route returns to, named by what the reader sees there. */
const routeLabels: Record<Exclude<Route['name'], 'browse'>, string> = {
  detail: '详情',
  actor: '演员作品',
  player: '播放',
  account: '账号',
  updates: '应用更新',
  settings: '设置',
};

/**
 * The back entry names its destination the way `store.back()` resolves it: the previous route
 * for a stacked page, or the section the browse root returns to.
 */
export function backLabelFor(
  routes: readonly Route[],
  section: Section,
  searchFromCategory: boolean,
) {
  const previous = routes.length > 1 ? routes[routes.length - 2] : undefined;
  if (previous)
    return `返回${previous.name === 'browse' ? sectionLabels[section] : routeLabels[previous.name]}`;
  return `返回${searchFromCategory ? sectionLabels.discover : sectionLabels.home}`;
}
