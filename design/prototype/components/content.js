// Design-only content compositions. Events are delegated by components.js.
// Cover assets and their provenance remain in design/prototype/assets/.
const examples = [
  { id: 'return', title: '重返1998', tags: '都市 · 重生', count: '全 72 集' },
  { id: 'spring', title: '春山不负', tags: '古装 · 女性成长', count: '更新至 48 集' },
  { id: 'night', title: '长夜有声', tags: '都市 · 悬疑', count: '全 36 集' },
];
const cover = (item, className = '') =>
  `<img class="${className}" src="../assets/${item.id}.png" alt="" />`;
const actionAttrs = (value, name) =>
  `data-action="content-demo" data-value="${value}" aria-label="${name}"`;

function posterCard(item, { focus = false, missing = false } = {}) {
  return `<article class="content-poster"><button class="content-poster-button ${focus ? 'force-focus' : ''}" ${actionAttrs(`detail:${item.id}`, `查看${item.title}详情`)}><span class="content-poster-cover ${missing ? 'content-cover-missing' : ''}">${missing ? '<span>封面暂不可用</span>' : cover(item)}<span class="content-cover-label">${item.count}</span></span><strong>${item.title}</strong><span class="content-meta">${item.tags}</span></button></article>`;
}
function continueCard(ctx, item, { unknownDuration = false } = {}) {
  const { button } = ctx;
  return `<article class="content-continue"><button class="content-continue-cover" ${actionAttrs(`detail:${item.id}`, `查看${item.title}详情`)}>${cover(item)}</button><div class="content-continue-body"><h3>${item.title}</h3><p>第 12 集 · 看到 00:36</p>${unknownDuration ? '' : '<div class="content-watch-progress" role="progressbar" aria-label="本集观看进度" aria-valuemin="0" aria-valuemax="120" aria-valuenow="36" aria-valuetext="看到 00:36，共 02:00"><span style="width:30%"></span></div>'}${button('继续第 12 集', { variant: 'primary', glyph: 'play', action: 'content-demo', extra: `data-value="resume:${item.id}"` })}</div></article>`;
}
function resultRow(ctx, item, { manage = false, selected = false, disabled = false } = {}) {
  const { button } = ctx;
  return `<article class="content-result-row ${manage ? 'content-record-row' : ''} ${selected ? 'content-row-selected' : ''}">${manage ? `<label class="content-record-selection"><input type="checkbox" data-content-record="${item.id}" ${selected ? 'checked' : ''} aria-label="选择${item.title}观看记录" /></label>` : ''}<button class="content-result-cover" ${actionAttrs(`detail:${item.id}`, `查看${item.title}详情`)}>${cover(item)}</button><div class="content-result-body"><h3><button class="content-title-action" ${actionAttrs(`detail:${item.id}`, `查看${item.title}详情`)}>${item.title}</button></h3><p>${manage ? '第 4 集 · 看到 00:36' : item.count}</p><p class="content-meta">${item.tags}</p></div><div class="content-row-actions">${button(manage ? '继续观看' : '查看详情', { glyph: manage ? 'play' : 'chevron-right', action: 'content-demo', disabled, extra: `data-value="${manage ? 'resume' : 'detail'}:${item.id}"` })}</div></article>`;
}

export function contentSheet(ctx) {
  const { section, row, sample, button, icon } = ctx;
  return (
    section(
      '海报与封面',
      row(
        'PosterCard',
        `<div class="content-poster-samples">${sample('普通', posterCard(examples[0]))}${sample('焦点', posterCard(examples[1], { focus: true }))}${sample('封面失败', posterCard(examples[2], { missing: true }))}</div>`,
      ) +
        row(
          '封面失败仍可操作',
          `<div class="content-fallback-row"><div class="content-cover-tile content-cover-missing">${icon('circle-alert')}<span>封面暂不可用</span></div><div><strong>长夜有声</strong><p class="content-meta">标题、选集与观看操作保留</p><div class="content-fallback-actions">${button('查看详情', { action: 'content-demo', extra: 'data-value="detail:night"' })}${button('重试封面', { variant: 'quiet', action: 'content-demo', extra: 'data-value="cover-retry:night"' })}</div></div></div>`,
        ),
    ) +
    section(
      '继续观看',
      row(
        'ContinueCard',
        `<div class="content-continue-samples">${sample('已知本集时长', continueCard(ctx, examples[0]))}${sample('没有时长时不画比例', continueCard(ctx, examples[1], { unknownDuration: true }))}</div>`,
      ),
    ) +
    section(
      '结果与列表',
      row(
        'ResultRow',
        `<div class="content-result-list">${resultRow(ctx, examples[0])}${resultRow(ctx, examples[1])}</div>`,
      ) +
        row(
          '追加与恢复',
          `<div class="content-list-end"><div class="inline">${button('加载更多', { action: 'content-demo', extra: 'data-value="load-more"' })}${button('加载中', { disabled: true, glyph: 'loader-circle' })}</div><div class="content-next-error" role="status"><span>后续结果加载失败，已显示的内容保留</span>${button('重试', { action: 'content-demo', extra: 'data-value="retry-more"' })}</div><p class="content-meta">已显示全部结果</p></div>`,
        ),
    ) +
    `<div class="contract"><span>封面不承载唯一标题或动作</span><span>同一卡片行为，两端只调整密度与取景</span><span>稳定内容身份，焦点不随追加重置</span></div>`
  );
}
