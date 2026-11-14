// Design fixtures share the board controller; no media or service is called.
const cinemaModes = [
  ['ready', '可播放'],
  ['preparing', '准备'],
  ['buffering', '缓冲'],
  ['error', '失败'],
  ['completed', '播完'],
  ['quality', '切换清晰度'],
  ['unknown', '时长未知'],
];
const model = (ctx) => (ctx.state.cinemaDemo ||= { mode: 'ready', hidden: false, chosen: 15 });

export function controlStateSamples(ctx) {
  const { section, row, button } = ctx;
  return section(
    '组内不可用状态',
    row(
      '单选',
      `<div class="choice-group" role="radiogroup" aria-label="可用题材示例">${[
        ['全部', false, true],
        ['都市', false, false],
        ['暂无古装数据', true, false],
        ['悬疑', false, false],
      ]
        .map(([label, disabled, checked]) =>
          button(label, {
            disabled,
            variant: checked ? 'selected' : '',
            action: 'cv-choice',
            extra: `role="radio" aria-checked="${checked}" tabindex="${checked ? 0 : -1}"`,
          }),
        )
        .join('')}</div>`,
    ) +
      row(
        '分区',
        `<div class="tabs" role="tablist" aria-label="分区禁用示例"><button type="button" data-tab="可查看" aria-selected="true" role="tab">可查看</button><button type="button" data-tab="暂不可用" role="tab" aria-selected="false" disabled tabindex="-1">暂不可用</button><button type="button" data-tab="更多内容" role="tab" aria-selected="false" tabindex="-1">更多内容</button></div><div class="tab-content" role="tabpanel" aria-label="可查看">当前分区：可查看</div>`,
      ),
  );
}

export function formStateSamples(ctx) {
  const { section, row, select } = ctx;
  const options = Array.from({ length: 24 }, (_, i) => ({
    label: `第 ${i + 1} 集${i === 7 ? ' · 标题较长时完整换行显示，焦点仍保持可见' : ''}`,
    disabled: i === 3 || i === 12,
  }));
  return section(
    '选择的边界状态',
    row(
      '暂不可用',
      select('清晰度暂不可用', ['按片源提供'], '按片源提供', 'disabled-quality', {
        disabled: true,
      }),
    ) + row('长列表与禁用项', select('长剧集列表', options, '第 1 集', 'long-options')),
  );
}

export function layerStateSamples(ctx) {
  const { section, row, button, icon } = ctx;
  return section(
    '受限空间',
    row(
      '靠近窗口边缘',
      `<div class="edge-anchor"><div class="select-wrap"><button type="button" class="select-trigger" data-popup="edge-commands" aria-haspopup="menu" aria-expanded="false">记录操作${icon('chevron-down')}</button><div class="popup" role="menu" aria-label="记录操作菜单" hidden>${['查看详情', '继续观看', '暂不可用', '移除记录'].map((label, i) => `<button type="button" role="menuitem" ${i === 2 ? 'disabled' : ''} data-action="${i === 3 ? 'cv-menu-remove' : 'notice'}">${label}</button>`).join('')}</div></div></div>`,
    ) +
      row(
        '窗口约束',
        `<p class="player-note">列表在可用空间内滚动，返回关闭并恢复来源。</p>${button('打开确认对话框', { action: 'dialog' })}`,
      ),
  );
}

export function cinemaStateSamples(ctx) {
  const { section, row, button, icon } = ctx;
  const demo = model(ctx);
  const blocked = ['preparing', 'buffering', 'error', 'quality'].includes(demo.mode);
  const title = {
    ready: '第 12 集',
    preparing: '正在准备播放…',
    buffering: '正在缓冲…',
    error: '播放遇到问题',
    completed: '本集已播完',
    quality: '正在切换清晰度…',
    unknown: '总时长未知',
  }[demo.mode];
  const tools = `<div class="spec-state-tools" role="group" aria-label="影院状态演示">${cinemaModes.map(([key, label]) => button(label, { variant: demo.mode === key ? 'selected' : 'quiet', action: 'cv-mode', extra: `data-value="${key}" data-demo-id="cv-mode-${key}" aria-pressed="${demo.mode === key}"` })).join('')}</div>`;
  const recover =
    demo.mode === 'error'
      ? `<p>当前视频未能加载，保留第 12 集与观看位置。</p><div class="inline">${button('重试播放', { action: 'cv-retry', extra: 'data-demo-id="cv-retry"' })}${button('返回选集', { variant: 'quiet', action: 'cv-return' })}</div>`
      : demo.mode === 'completed'
        ? button('重新播放', { glyph: 'play', action: 'cv-replay' })
        : '';
  const waiting = ['preparing', 'buffering', 'quality'].includes(demo.mode);
  return (
    section(
      '影院状态层',
      tools +
        `<div class="cinema cinema-state-demo"><div class="cinema-state-stage" tabindex="0" role="group" aria-label="影院画面与状态" data-demo-id="cv-stage"><div class="cinema-state-message" role="status">${waiting ? icon('loader-circle', 'spin') : ''}<strong>${title}</strong>${recover}</div></div><div class="cinema-state-controls" ${demo.hidden ? 'hidden' : ''}><div class="inline">${button('播放本集', { glyph: 'play', action: 'cv-play', disabled: blocked, extra: 'data-demo-id="cv-play"' })}${button('隐藏播控', { variant: 'quiet', action: 'cv-hide', disabled: blocked })}</div><label class="cinema-state-seek">播放位置${demo.mode === 'unknown' ? '<span class="player-note">00:36 · 暂不提供定位比例</span>' : `<input type="range" aria-label="状态样板播放位置" min="0" max="120" value="36" data-committed="36" style="--fill:30%" ${blocked ? 'disabled' : ''} />`}</label><span class="player-note">${demo.hidden ? '确认显示播控' : '焦点留在可见控件；返回收起播控'}</span></div>${demo.hidden ? '<p class="player-note">确认显示播控</p>' : ''}</div>`,
    ) +
    section(
      '选集状态',
      row(
        '播放与浏览分开',
        `<p class="player-note">春山不负 · 正在播放第 12 集 · 浏览选择第 ${demo.chosen} 集（演示）</p><div class="episode-grid episode-state-grid" role="group" aria-label="播放与浏览选集">${[12, 13, 14, 15, 16, 49].map((value) => button(value === 49 ? '49 · 未开放' : `${value}${value === 12 ? ' · 播放中' : ''}`, { action: 'cv-episode', disabled: value === 49, variant: demo.chosen === value ? 'selected' : '', extra: `data-value="${value}" data-demo-id="cv-episode-${value}" aria-pressed="${demo.chosen === value}"` })).join('')}</div>`,
      ),
    )
  );
}

export function handleCoverageAction(action, target, ctx) {
  if (!action.startsWith('cv-')) return false;
  const demo = model(ctx);
  if (action === 'cv-choice') {
    target.parentElement.querySelectorAll('[role=radio]').forEach((el) => {
      el.classList.toggle('selected', el === target);
      el.setAttribute('aria-checked', el === target);
      el.tabIndex = el === target ? 0 : -1;
    });
    return true;
  }
  if (action === 'cv-menu-remove') {
    ctx.openLayer('dialog', target.closest('.select-wrap').querySelector('[data-popup]'));
    return true;
  }
  if (action === 'cv-mode') {
    demo.mode = target.dataset.value;
    demo.hidden = false;
  } else if (action === 'cv-retry') {
    demo.mode = 'preparing';
    ctx.refresh('[data-demo-id=cv-mode-ready]');
    return true;
  } else if (action === 'cv-replay' || action === 'cv-play') {
    demo.mode = 'ready';
    demo.hidden = false;
  } else if (action === 'cv-hide') {
    demo.hidden = true;
    ctx.refresh('[data-demo-id=cv-stage]');
    return true;
  } else if (action === 'cv-return') {
    ctx.refresh('[data-demo-id=cv-episode-12]');
    return true;
  } else if (action === 'cv-episode') demo.chosen = Number(target.dataset.value);
  ctx.refresh(target);
  return true;
}

export function handleCoverageKey(event, ctx) {
  const active = document.activeElement;
  if (active.matches('[data-demo-id=cv-stage]') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    model(ctx).hidden = false;
    ctx.refresh('[data-demo-id=cv-play]');
    return true;
  }
  if (event.key === 'Escape' && active.closest('.cinema-state-controls')) {
    event.preventDefault();
    model(ctx).hidden = true;
    ctx.refresh('[data-demo-id=cv-stage]');
    return true;
  }
  return false;
}
