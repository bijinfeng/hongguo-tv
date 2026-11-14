/**
 * Feedback design specimens. No service, media, account or persistence effects.
 * Motion inventory: controls inherit shared press/hover; one indeterminate bar
 * translates only while its demonstration wait is shown. Reduced motion leaves
 * the bar still and preserves the status text. Skeletons do not shimmer. Toast
 * dismissal is immediate and never runs on a timer. Tooltip is instant on focus
 * or pointer rest; TV shows its meaning in the labeled control itself.
 */
export function feedbackSheet(ctx) {
  const { icon, button, section, row, sample, state } = ctx;
  const retry = button('重试', { action: 'retry-feedback' });
  const loading = `<div class="fb-inline" role="status">${icon('loader-circle', 'spin')}<span>正在加载剧目<span class="fb-demo">演示状态</span></span></div>`;
  const complete = `<div class="fb-inline" role="status">${icon('check')}<span>记录已移除<span class="fb-demo">演示状态</span></span>${button('撤销', { variant: 'quiet', action: 'undo-feedback' })}</div>`;
  const unavailable = `<div class="fb-inline fb-inline-error" role="status">${icon('circle-alert')}<span>无法保存<span class="fb-demo">演示状态</span></span>${button('重试', { variant: 'quiet', action: 'retry-feedback' })}</div>`;

  return (
    section(
      '原位反馈',
      row('状态文字', `<div class="fb-status-stack">${loading}${complete}${unavailable}</div>`) +
        row(
          '读取失败',
          `<div class="fb-notice" role="status">${icon('circle-alert')}<div class="fb-notice-copy"><strong>加载失败</strong><p>请检查网络后重试</p></div>${retry}</div>`,
        ) +
        row(
          '追加失败',
          `<div class="fb-inline fb-inline-wrap" role="status"><span>后续剧目加载失败，已加载内容仍保留</span>${button('重试加载', { action: 'retry-feedback' })}</div>`,
        ),
    ) +
    section(
      '加载与进度',
      row(
        '确定进度',
        `<div class="fb-progress-sample"><div class="fb-progress-heading"><span id="fb-progress-title">更新包下载进度（示例）</span><span class="fb-progress-value">60%</span></div><div class="fb-progress" role="progressbar" aria-labelledby="fb-progress-title" aria-valuemin="0" aria-valuemax="80" aria-valuenow="48" aria-valuetext="48 / 80 MB，60%"><span style="width:60%"></span></div><div class="fb-progress-detail"><span>48 / 80 MB</span><span>仅演示应用更新包，不是离线剧集</span></div></div>`,
      ) +
        row(
          '不确定进度',
          `<div class="fb-progress-sample"><p class="fb-progress-heading" id="fb-wait-title">正在检查更新（演示）</p><div class="fb-progress fb-progress-indeterminate" role="progressbar" aria-labelledby="fb-wait-title"><span></span></div></div>`,
        ) +
        row(
          '内容骨架',
          `<div class="fb-skeleton" role="status" aria-label="正在加载剧目，演示状态"><div class="fb-skeleton-cover" aria-hidden="true"></div><div class="fb-skeleton-text" aria-hidden="true"><span></span><span></span><span></span></div></div>`,
        ),
    ) +
    section(
      '空内容与恢复',
      row(
        '首次使用',
        `<div class="fb-empty"><strong>还没有观看记录</strong><p>看过的短剧会保存在这里</p>${button('去找剧', { action: 'feedback-browse' })}</div>`,
      ) +
        row(
          '没有结果',
          `<div class="fb-empty"><strong>没有找到相关短剧</strong><p>试试其他剧名或演员</p>${button('清空筛选', { variant: 'quiet', action: 'reset-filters' })}</div>`,
        ) +
        row(
          '整页失败',
          `<div class="fb-empty"><div class="fb-empty-symbol">${icon('circle-alert')}</div><strong>暂时无法加载片库</strong><p>请检查网络后重试</p>${button('重新加载', { action: 'retry-feedback' })}</div>`,
        ),
    ) +
    section(
      '短提示与辅助说明',
      row(
        'Toast',
        `<div class="fb-toast-region" aria-label="演示短提示"><div class="fb-toast" role="status">${icon('check')}<div class="fb-toast-copy"><strong>记录已移除</strong><span>演示状态，不写入数据</span></div>${button('撤销', { variant: 'quiet', action: 'undo-feedback' })}${button('关闭提示', { variant: 'quiet', glyph: 'x', iconOnly: true, action: 'dismiss-feedback' })}</div><p class="fb-caption">手动关闭；关键结果不只保存在短提示里</p></div>`,
      ) +
        row(
          state.platform === 'tv' ? '常显动作' : 'Tooltip',
          `<div class="fb-tooltip-layout">${sample(
            state.platform === 'tv' ? 'TV · 直接读到动作' : '桌面 · 悬停或聚焦',
            state.platform === 'tv'
              ? button('播放设置', { glyph: 'settings', action: 'feedback-settings' })
              : `<div class="fb-tooltip-host">${button('设置', { glyph: 'settings', iconOnly: true, action: 'feedback-settings', extra: 'aria-describedby="fb-tooltip"' })}<span class="fb-tooltip" id="fb-tooltip" role="tooltip">播放设置</span></div>`,
          )}</div>`,
        ),
    ) +
    `<div class="contract"><span>等待不显示假百分比</span><span>空态说明下一步，错误保留上下文</span><span>减少动态效果时保留文字与进度含义</span></div>`
  );
}
