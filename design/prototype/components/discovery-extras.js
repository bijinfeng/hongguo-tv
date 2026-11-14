// Design data only. The shared board controller owns event delegation and refresh.
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const seasons = [
  { id: 1, title: '第一季', available: true, resume: true },
  { id: 2, title: '第二季', available: true, resume: false },
  { id: 3, title: '第三季', available: false, resume: false },
];
const filterDimensions = [
  ['kind', '剧种', ['全部', '真人剧', '漫剧', 'AI剧']],
  ['audience', '人群', ['全部', '男频', '女频']],
  ['background', '背景', ['全部', '现代', '古代']],
  ['genre', '题材', ['全部', '都市', '古装', '悬疑']],
];
function model(ctx) {
  return (ctx.state.discovery ||= {
    date: 14,
    season: 1,
    playingSeason: 1,
    playingEpisode: 12,
    filtersExpanded: false,
    filters: { kind: '全部', audience: '全部', background: '全部', genre: '全部' },
    snapshot: 'normal',
    reservation: 'none',
    noticeRead: false,
    status: '',
  });
}
function actionButton(ctx, label, action, value, options = {}) {
  const { demoId = `dx-${action}-${value}`, ...buttonOptions } = options;
  return ctx.button(label, {
    ...buttonOptions,
    action: `dx-${action}`,
    extra: `data-value="${escape(value)}" data-demo-id="${escape(demoId)}" ${options.extra || ''}`,
  });
}
function choices(ctx, label, values, selected, dimension) {
  return `<div class="dx-choice-row"><span>${escape(label)}</span><div class="dx-choices" role="radiogroup" aria-label="${escape(label)}筛选">${values
    .map((value) =>
      actionButton(ctx, value, 'filter', `${dimension}:${value}`, {
        variant: selected === value ? 'selected' : '',
        extra: `role="radio" aria-checked="${selected === value}" tabindex="${selected === value ? 0 : -1}"`,
      }),
    )
    .join('')}</div></div>`;
}
function reservationAction(ctx, current, action = 'reserve') {
  const pending = current.reservation === 'pending';
  const confirmed = current.reservation === 'confirmed';
  return actionButton(
    ctx,
    pending ? '已提交 · 待确认' : confirmed ? '取消预约' : '预约第三季',
    action,
    'season-3',
    { disabled: pending, variant: confirmed ? '' : 'primary' },
  );
}
export function discoveryNavigation(ctx) {
  const { section, row } = ctx;
  const current = model(ctx);
  const season = seasons.find((item) => item.id === current.season);
  const chosen = filterDimensions
    .filter(([key]) => current.filters[key] !== '全部')
    .map(([key, label]) => `${label}：${current.filters[key]}`);
  const dateContent = `<div class="dx-stack"><div class="dx-date-strip" role="group" aria-label="上新日期，2026年11月演示">${[
    [13, '周五'],
    [14, '今天'],
    [15, '周日'],
  ]
    .map(([date, label]) =>
      actionButton(
        ctx,
        `<span>${label}</span><strong>${date}</strong><span>11月</span>`,
        'date',
        date,
        {
          variant: `dx-date ${date === current.date ? 'selected' : ''}`,
          extra: `aria-pressed="${date === current.date}" aria-label="11月${date}日${date === 14 ? '，今天' : ''}"`,
        },
      ),
    )
    .join('')}</div><div class="dx-date-result" role="status">${
    current.date === 15
      ? `<strong>这天暂未安排上新</strong>${actionButton(ctx, '查看今天', 'date', 14, { variant: 'quiet', demoId: 'dx-date-reset', extra: 'data-date-reset' })}`
      : `<strong>11月${current.date}日上新安排</strong><span>已上线 · 重返1998</span>${current.date === 14 ? '<span>待上线 · 春山不负第三季</span>' : ''}`
  }</div><p class="player-note">固定日期演示；未知安排不补齐。</p></div>`;
  const seasonContent = `<div class="dx-stack"><div class="dx-seasons" role="group" aria-label="春山不负系列季">${seasons
    .map((item) => {
      const badge = !item.available
        ? '待上线'
        : item.id === current.playingSeason
          ? '播放中'
          : item.resume
            ? '可续播'
            : '可观看';
      return actionButton(
        ctx,
        `${item.title}<span class="dx-season-status">${badge}</span>`,
        'season',
        item.id,
        {
          variant: current.season === item.id ? 'selected' : '',
          extra: `aria-pressed="${current.season === item.id}" aria-label="${item.title}，${badge}"`,
        },
      );
    })
    .join(
      '',
    )}</div><div class="dx-inline-status"><div><strong>正在浏览${season.title}</strong><p class="type-meta">当前播放：第${current.playingSeason}季 · 第 ${current.playingEpisode} 集</p></div>${
    season.available
      ? actionButton(ctx, season.resume ? '继续第 12 集' : '开始观看', 'play-season', season.id, {
          variant: 'primary',
          glyph: 'play',
        })
      : reservationAction(ctx, current, 'season-reserve')
  }</div>${!season.available ? '<p class="type-meta">该季尚未上线，没有可播放剧集。</p>' : ''}</div>`;
  const filters = `<div class="dx-stack"><div class="dx-filter-fields">${filterDimensions
    .filter((_, index) => index < 2 || current.filtersExpanded)
    .map(([key, label, values]) => choices(ctx, label, values, current.filters[key], key))
    .join(
      '',
    )}</div><div class="dx-filter-summary"><span role="status">${chosen.length ? chosen.map(escape).join(' · ') : '全部分类'}</span><div class="inline">${actionButton(ctx, current.filtersExpanded ? '收起筛选' : '更多筛选', 'filters-toggle', 'toggle', { variant: 'quiet', extra: `aria-expanded="${current.filtersExpanded}"` })}${actionButton(ctx, '清除条件', 'filters-reset', 'reset', { variant: 'quiet', disabled: !chosen.length })}</div></div></div>`;
  return (
    section('上新与系列', row('日期条', dateContent) + row('季选择', seasonContent)) +
    section('分类筛选', row('多维条件', filters))
  );
}
function rankedRow(ctx, { actor = false, title, rank, cover, caption }) {
  return `<article class="dx-ranked-row"><span class="dx-rank-number" aria-label="第 ${rank} 名">${rank}</span>${
    actor
      ? '<span class="avatar-spec dx-actor-avatar" aria-hidden="true">林</span>'
      : `<img class="dx-rank-cover" src="../assets/${cover}.png" alt="" />`
  }<div class="dx-row-copy"><h3>${escape(title)}</h3><p class="type-meta">${escape(caption)}</p></div>${actionButton(ctx, actor ? '查看作品' : '查看详情', actor ? 'actor' : 'detail', actor ? 'lin' : cover, { variant: 'quiet', glyph: 'chevron-right', demoId: `dx-ranked-${actor ? 'actor' : cover}` })}</article>`;
}
function snapshotTable(ctx, current) {
  const failed = current.snapshot === 'failed';
  const partial = current.snapshot === 'partial';
  const stale = current.snapshot === 'stale';
  const rows = [
    ['1', '上升 2', '重返1998', '真人剧', '98,420', '+3,200', '+820', '12天', 'return'],
    ['2', '持平', '春山不负：风起时再相逢', '真人剧', '96,700', null, '+640', '8天', 'spring'],
    ['3', '新上榜', '长夜有声', '未知', null, null, '+120', null, 'night'],
  ];
  const states = [
    ['normal', '正常'],
    ['stale', '过期缓存'],
    ['partial', '部分失败'],
    ['failed', '读取失败'],
  ];
  return `<div class="dx-stack"><div class="dx-table-heading"><div><strong>官方榜单快照</strong><p class="type-meta">来源：hongguo-radar 外部聚合 · 2026年11月13日18:00 · 演示</p></div>${actionButton(ctx, '刷新快照', 'snapshot-refresh', 'refresh', { glyph: 'loader-circle' })}</div>${
    stale
      ? '<p class="dx-data-warning" role="status">刷新失败，保留最近成功数据。获取时间：11月13日18:00（演示）。</p>'
      : partial
        ? '<p class="dx-data-warning" role="status">增长数据暂不可用，快照榜位仍可查看。</p>'
        : ''
  }${
    failed
      ? `<div class="dx-empty" role="status"><strong>榜单快照暂不可用</strong>${actionButton(ctx, '重新读取', 'snapshot-refresh', 'retry')}</div>`
      : `<div class="dx-table-scroll" role="region" aria-label="榜单快照数据，可横向滚动" tabindex="0" data-scroll-id="dx-snapshot"><table class="dx-table"><thead><tr>${['名次', '变化', '短剧', '类型', '热度', '热度日增', '收藏日增', '连续在榜'].map((label) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows
          .map((values) => {
            const cells = values.slice(0, 8).map((value, index) => {
              if (index === 2)
                return `<th scope="row">${actionButton(ctx, escape(value), 'detail', values[8], { variant: 'quiet dx-table-title', demoId: `dx-snapshot-title-${values[8]}` })}</th>`;
              const text =
                value === null || (partial && [4, 5, 6].includes(index)) ? '—' : escape(value);
              return `<td${index === 1 ? ' class="dx-table-change"' : ''}>${text}</td>`;
            });
            return `<tr>${cells.join('')}</tr>`;
          })
          .join('')}</tbody></table></div>`
  }<div class="dx-fixture-controls" role="group" aria-label="快照状态演示">${states
    .map(([value, label]) =>
      actionButton(ctx, label, 'snapshot-state', value, {
        variant: current.snapshot === value ? 'selected' : 'quiet',
        extra: `aria-pressed="${current.snapshot === value}"`,
      }),
    )
    .join('')}</div><p class="player-note">缺失值保留为 —；未把增长数据缺失补成 0。</p></div>`;
}
function reservationRow(ctx, current) {
  const messages = {
    none: '待上线 · 11月14日18:00（演示）',
    pending: '请求已提交，等待预约列表确认。',
    confirmed: '已在预约列表确认（演示）',
    failed: '未能确认预约，保留当前内容，可重试。',
  };
  return `<div class="dx-stack"><article class="dx-status-row"><img class="dx-rank-cover" src="../assets/spring.png" alt="" /><div class="dx-row-copy"><h3>春山不负 · 第三季</h3><p class="${current.reservation === 'failed' ? 'field-error' : 'type-meta'}" role="status">${messages[current.reservation]}</p></div>${reservationAction(ctx, current)}</article>${
    current.reservation === 'pending'
      ? `<div class="dx-fixture-controls" role="group" aria-label="预约结果演示">${actionButton(ctx, '模拟列表确认', 'reservation-result', 'confirmed', { variant: 'quiet' })}${actionButton(ctx, '模拟确认失败', 'reservation-result', 'failed', { variant: 'quiet' })}</div>`
      : ''
  }<article class="dx-status-row"><div class="dx-row-copy"><h3>${current.noticeRead ? '' : '<span class="status-tag tag-selected">未读</span> '}春山不负更新了 8 集</h3><p class="type-meta">${current.noticeRead ? '已读 · 提醒仍保留' : '更新提醒 · 演示'}</p></div><div class="inline">${actionButton(ctx, '查看更新', 'detail', 'spring', { variant: 'quiet' })}${actionButton(ctx, current.noticeRead ? '已读' : '标为已读', 'notice-read', 'spring', { disabled: current.noticeRead })}</div></article><p class="player-note">预约与提醒均为本次设计演示，不提交账号请求。</p></div>`;
}
export function discoveryContent(ctx) {
  const current = model(ctx);
  return (
    ctx.section(
      '榜单与演员',
      ctx.row(
        '榜位与身份',
        `<div class="dx-ranked-list">${rankedRow(ctx, { title: '重返1998', rank: 1, cover: 'return', caption: '真人剧 · 热度 98,420（演示）' })}${rankedRow(ctx, { actor: true, title: '林川', rank: 2, caption: '演员 · 星光榜（演示）' })}</div>`,
      ) + ctx.row('只读快照', snapshotTable(ctx, current)),
    ) + ctx.section('提醒与预约', ctx.row('内容状态行', reservationRow(ctx, current)))
  );
}
export function handleDiscoveryAction(action, target, ctx) {
  if (!action.startsWith('dx-')) return false;
  const current = model(ctx);
  const value = target.dataset.value;
  let changed = true;
  let announcement = '';
  switch (action) {
    case 'dx-date':
      if (![13, 14, 15].includes(Number(value))) return true;
      current.date = Number(value);
      break;
    case 'dx-season':
      if (!seasons.some((item) => item.id === Number(value))) return true;
      current.season = Number(value);
      break;
    case 'dx-play-season': {
      const season = seasons.find((item) => item.id === Number(value));
      if (!season?.available) return true;
      current.playingSeason = season.id;
      current.playingEpisode = season.resume ? 12 : 1;
      announcement = `演示播放第${season.id}季，未调用媒体服务。`;
      break;
    }
    case 'dx-filter': {
      const [key, selected] = value.split(':');
      const dimension = filterDimensions.find(([name]) => name === key);
      if (dimension?.[2].includes(selected)) current.filters[key] = selected;
      break;
    }
    case 'dx-filters-toggle':
      current.filtersExpanded = !current.filtersExpanded;
      break;
    case 'dx-filters-reset':
      for (const [key] of filterDimensions) current.filters[key] = '全部';
      break;
    case 'dx-snapshot-state':
      if (!['normal', 'stale', 'partial', 'failed'].includes(value)) return true;
      current.snapshot = value;
      break;
    case 'dx-snapshot-refresh':
      current.snapshot = 'normal';
      announcement = '已恢复快照演示，未请求真实榜单。';
      break;
    case 'dx-season-reserve':
    case 'dx-reserve':
      if (current.reservation === 'pending') return true;
      current.reservation = current.reservation === 'confirmed' ? 'none' : 'pending';
      break;
    case 'dx-reservation-result':
      if (current.reservation === 'pending' && ['confirmed', 'failed'].includes(value))
        current.reservation = value;
      break;
    case 'dx-notice-read':
      current.noticeRead = true;
      break;
    case 'dx-actor':
      ctx.announce('演示查看林川的作品列表；演员条目不会触发播放。');
      changed = false;
      break;
    case 'dx-detail':
      ctx.announce('演示打开短剧详情；没有发起真实请求或播放。');
      changed = false;
      break;
    default:
      return false;
  }
  if (changed) ctx.refresh(target);
  if (announcement) ctx.announce(announcement);
  return true;
}
