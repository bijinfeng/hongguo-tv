import { foundationSheet, navigationSheet } from './foundations.js';
import { contentSheet } from './content.js';
import { feedbackSheet } from './feedback.js';
import { formExtras, anchoredLayers } from './form-extras.js';
import {
  discoveryNavigation,
  discoveryContent,
  handleDiscoveryAction,
} from './discovery-extras.js';
import {
  accountForms,
  handleAccountAction,
  handleAccountInput,
  handleAccountKey,
} from './account-extras.js';
import {
  collectionContent,
  handleCollectionAction,
  handleCollectionChange,
  handleCollectionKey,
  collectionAfterRender,
} from './collection-extras.js';
import {
  controlStateSamples,
  formStateSamples,
  layerStateSamples,
  cinemaStateSamples,
  handleCoverageAction,
  handleCoverageKey,
} from './coverage-states.js';
import {
  frequentFoundation,
  frequentControls,
  frequentForms,
  frequentAfterRender,
  handleFrequentAction,
  handleFrequentChange,
  handleFrequentKey,
  handleFrequentFocus,
} from './frequent-extras.js';

const root = document.documentElement;
const board = document.querySelector('#board');
const params = new URLSearchParams(location.search);
const state = {
  platform: ['common', 'desktop', 'tv'].includes(params.get('platform'))
    ? params.get('platform')
    : 'desktop',
  sheet: [
    'foundation',
    'controls',
    'forms',
    'navigation',
    'layers',
    'content',
    'cinema',
    'feedback',
  ].includes(params.get('sheet'))
    ? params.get('sheet')
    : 'controls',
  theme: params.get('theme') === 'dark' ? 'dark' : 'light',
  genre: '全部',
  tab: '收藏',
  autoNext: true,
  query: '',
  playback: false,
  episode: 12,
  navDemo: '首页',
  pageDemo: 1,
  sectionDemo: '总榜',
};
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const { icon, button } = globalThis.HongguoComponents;
const sample = (label, content) => `<div class="sample"><small>${label}</small>${content}</div>`;
const row = (label, content) =>
  `<div class="spec-row"><h3>${label}</h3><div>${content}</div></div>`;
const section = (heading, content) =>
  `<section class="spec-section"><h2>${heading}</h2>${content}</section>`;
const choiceGroup = () =>
  `<div class="choice-group" role="radiogroup" aria-label="题材">${['全部', '都市', '古装', '悬疑'].map((label) => button(label, { variant: state.genre === label ? 'selected' : '', action: 'genre', extra: `data-value="${label}" role="radio" aria-checked="${state.genre === label}" tabindex="${state.genre === label ? 0 : -1}"` })).join('')}</div>`;
const select = (label, options, value, key, config = {}) => {
  const current = state.selectValues?.[key] || value;
  return `<div class="select-wrap"><button type="button" class="select-trigger" aria-label="${escape(label)}" aria-haspopup="listbox" aria-expanded="false" data-select="${key}" ${config.disabled ? 'disabled' : ''}><span>${escape(current)}</span>${icon('chevron-down')}</button><div class="popup" role="listbox" aria-label="${escape(label)}" hidden>${options
    .map((entry) => {
      const item = typeof entry === 'string' ? { label: entry } : entry;
      return `<button type="button" role="option" aria-selected="${item.label === current}" data-option="${escape(item.label)}" data-key="${key}" ${item.disabled ? 'disabled' : ''}>${escape(item.label)}${item.label === current ? icon('check') : '<span></span>'}</button>`;
    })
    .join('')}</div></div>`;
};
const episodes = (count = 18, start = 1) =>
  `<div class="episode-grid" role="group" aria-label="选择剧集">${Array.from({ length: count }, (_, i) => button(String(i + start), { variant: state.episode === i + start ? 'selected' : '', action: 'episode', extra: `data-value="${i + start}" aria-pressed="${state.episode === i + start}" aria-label="第 ${i + start} 集"` })).join('')}</div>`;
const dialogContent = () =>
  `<h2>移除观看记录？</h2><p>将移除《重返1998》的本地观看记录。</p><div class="dialog-actions">${button('取消', { action: 'close' })}${button('移除', { variant: 'destructive', action: 'confirm' })}</div>`;

function controls() {
  return (
    section(
      '按钮',
      row(
        '动作层级',
        `<div class="samples">${sample('主要动作', button('立即播放', { variant: 'primary', glyph: 'play', action: 'play-demo' }))}${sample('普通动作', button('收藏', { glyph: 'bookmark', action: 'favorite', extra: 'aria-pressed="false"' }))}${sample('轻量动作', button('全部记录', { variant: 'quiet', glyph: 'chevron-right', action: 'notice' }))}${sample('危险动作', button('移除', { variant: 'destructive', action: 'dialog' }))}</div>`,
      ) +
        row(
          '交互状态',
          `<div class="samples">${sample('默认', button('继续观看'))}${state.platform === 'desktop' ? sample('悬停 · 仅键鼠', button('继续观看', { variant: 'force-hover' })) : ''}${sample('按下', button('继续观看', { variant: 'force-pressed' }))}${sample('焦点', button('继续观看', { variant: 'force-focus' }))}</div>`,
        ) +
        row(
          '值与可用性',
          `<div class="samples">${sample('选中', button('已收藏', { variant: 'selected', glyph: 'check', action: 'favorite', extra: 'aria-pressed="true"' }))}${sample('选中 + 焦点', button('已收藏', { variant: 'selected force-focus', glyph: 'check', action: 'favorite', extra: 'aria-pressed="true"' }))}${sample('不可用', button('下一集', { disabled: true, glyph: 'skip-forward' }))}${sample('等待确认', `<button class="ui-button" disabled aria-busy="true">${icon('loader-circle', 'spin')}保存中</button>`)}</div>`,
        ) +
        row(
          '状态组合',
          `<div class="samples">${sample('主要 + 选中', button('已选择观看', { variant: 'primary selected force-focus', glyph: 'check', extra: 'aria-pressed="true"' }))}${sample('主要 + 选中 + 禁用', button('已选择观看', { variant: 'primary selected', glyph: 'check', disabled: true, extra: 'aria-pressed="true"' }))}${sample('危险 + 选中', button('已选择移除', { variant: 'destructive selected', extra: 'aria-pressed="true"' }))}</div>`,
        ) +
        row(
          '尺寸与图标',
          `<div class="samples">${sample('标准', button('搜索', { glyph: 'search', action: 'notice' }))}${state.platform === 'desktop' ? sample('紧凑 · 次要操作', button('更多', { variant: 'compact', action: 'notice' })) : ''}${sample('图标操作', `<div class="inline">${button('搜索', { glyph: 'search', iconOnly: true, action: 'notice' })}${button('关闭', { glyph: 'x', iconOnly: true, action: 'notice' })}${button('设置', { glyph: 'settings', iconOnly: true, action: 'notice' })}</div>`)}<span class="size-rule">${state.platform === 'tv' ? '60 高 · 图标 26 · 内距 24' : '44 高 · 图标 20 · 内距 16'}</span></div>`,
        ),
    ) +
    section('选择', row('题材筛选', choiceGroup()) + row('页面内分区', tabs())) +
    controlStateSamples(context()) +
    frequentControls(context()) +
    `<div class="contract"><span>焦点 ≠ 选中</span><span>点击 / 确认执行同一动作</span><span>禁用与等待状态不执行动作</span></div>`
  );
}
function tabs() {
  return `<div class="tabs" role="tablist" aria-label="片库分区">${['收藏', '追更', '预约'].map((name) => `<button type="button" role="tab" aria-selected="${state.tab === name}" tabindex="${state.tab === name ? 0 : -1}" data-tab="${name}">${name}</button>`).join('')}</div><div class="tab-content" role="tabpanel" aria-label="${state.tab}">当前分区：${state.tab}</div>`;
}
function forms() {
  return (
    section(
      '输入与选择',
      row(
        '搜索',
        `<form class="search-form"><div class="field"><label for="query">短剧、演员</label><div class="input-with-icon">${icon('search')}<input class="ui-input" id="query" placeholder="搜索短剧、演员" value="${escape(state.query)}" ${state.platform === 'tv' ? 'readonly' : ''} />${button('清空搜索', { variant: 'quiet', glyph: 'x', iconOnly: true, action: 'clear-query' })}</div></div>${button('搜索', { variant: 'primary', action: 'search' })}</form><div id="query-status" class="player-note" role="status">${state.platform === 'tv' ? '确认后编辑；返回结束编辑，保留输入。' : '输入后按 Enter 搜索，保留查询内容。'}</div>`,
      ) +
        row(
          '字段状态',
          `<div class="samples">${sample('默认', `<div class="field"><label for="normal-input">剧名</label><input id="normal-input" class="ui-input" placeholder="输入剧名" /></div>`)}${sample('错误', `<div class="field"><label for="invalid-input">剧名</label><input id="invalid-input" class="ui-input" aria-invalid="true" aria-describedby="field-error" value="" placeholder="输入剧名" /><span id="field-error" class="field-error">请输入剧名后再搜索</span></div>`)}${sample('禁用', `<div class="field"><label for="disabled-input">手机号</label><input id="disabled-input" class="ui-input" value="暂不可用" disabled /></div>`)}</div>`,
        ) +
        formExtras(context()) +
        row('单选', select('排序', ['最近更新', '最近收藏', '剧名排序'], '最近更新', 'sort')) +
        row(
          '偏好设置',
          `<div class="toggle-row"><span id="next-label">自动播放下一集</span><button class="switch-hit" role="switch" aria-labelledby="next-label" aria-checked="${state.autoNext}" data-action="auto-next"><span class="switch" aria-hidden="true" aria-checked="${state.autoNext}"><span></span></span></button></div>`,
        ) +
        row(
          '多选',
          `<label class="check-label"><input type="checkbox" checked />选中这条观看记录</label>`,
        ),
    ) +
    formStateSamples(context()) +
    accountForms(context()) +
    frequentForms(context()) +
    `<div class="contract"><span>保留输入、结果和焦点</span><span>原位反馈优先</span><span>只读、错误与禁用分开表达</span></div>`
  );
}
function layers() {
  return (
    `<div class="layer-layout"><section><h2>确认对话框</h2><div class="dialog-preview">${dialogContent()}</div><div class="inline">${button('打开确认对话框', { action: 'dialog' })}</div></section><section><h2>选集侧面板</h2><div class="dialog-preview"><div class="cinema-head"><h3>选集</h3><span class="size-rule"><span data-current-episode>第 ${state.episode} 集</span></span></div>${episodes(12)}</div><div class="inline">${button('打开选集面板', { action: 'sheet' })}</div></section></div>` +
    section(
      '锚点弹层',
      anchoredLayers(context()) +
        row(
          '选项列表',
          `<div class="inline">${select('剧集范围', ['1–20 集', '21–40 集', '41–60 集'], '1–20 集', 'range')}<span class="size-rule">确认选择 · 返回取消</span></div>`,
        ),
    ) +
    layerStateSamples(context()) +
    `<div class="contract"><span>打开 → 来源焦点留存 → 层内操作 → 关闭后恢复来源</span><span>${state.platform === 'tv' ? '返回键先关闭最上层' : 'Esc 先关闭最上层'}</span><span>危险确认默认落在取消</span></div>`
  );
}
function cinema() {
  return (
    section(
      '影院控件',
      `<div class="cinema"><div class="cinema-head"><h3>重返1998 <span class="size-rule"><span data-current-episode>第 ${state.episode} 集</span></span></h3>${button('关闭播放', { variant: 'quiet', glyph: 'x', iconOnly: true, action: 'notice' })}</div><div class="slider-row"><time>00:36</time><div class="slider-wrap"><label for="seek">播放进度</label><input id="seek" type="range" min="0" max="120" value="36" data-committed="36" style="--fill:30%" aria-valuetext="00:36，共 02:00" /></div><time>02:00</time></div><div class="cinema-bottom"><div class="inline">${button(state.playback ? '暂停' : '播放', { glyph: state.playback ? 'pause' : 'play', iconOnly: true, action: 'playback' })}${button('下一集', { glyph: 'skip-forward', iconOnly: true, disabled: state.episode >= 72, action: 'next-episode' })}<div class="slider-row">${icon('volume-2')}<input type="range" min="0" max="100" value="60" data-committed="60" style="--fill:60%;width:120px" aria-label="音量" /></div></div><div class="inline">${select('播放速度', ['0.75×', '1.0×', '1.25×', '1.5×', '2.0×'], '1.0×', 'speed')}${button('选集', { action: 'sheet' })}${button('全屏', { glyph: 'maximize', iconOnly: true, action: 'fullscreen-demo' })}</div></div></div><p class="player-note" id="seek-status" role="status">${state.platform === 'tv' ? '确认进入调整，左右预览，再次确认提交，返回取消。' : '可拖动或用方向键调整，结束调整后提交。'}样例进度 00:36 / 02:00，无真实视频。</p>`,
    ) +
    section(
      '选集',
      row('选择剧集', episodes()) +
        row(
          '不可用',
          `<div class="inline">${button('下一集', { disabled: true, glyph: 'skip-forward' })}<span class="size-rule">已是最后一集</span></div>`,
        ),
    ) +
    cinemaStateSamples(context()) +
    `<div class="contract"><span>焦点不缩放画面或卡片</span><span>预览与定位提交分开</span><span>自动隐藏前先确认焦点已离开控件</span></div>`
  );
}
function common() {
  const colors = [
    ['页面', 'background'],
    ['正文', 'foreground'],
    ['主动作', 'primary'],
    ['中性', 'muted'],
    ['选中', 'accent'],
    ['焦点', 'ring'],
  ];
  return (
    `<div class="board-heading"><div><h1>公共基础</h1><p>同一组件、同一状态契约；按观看距离与输入设备适配。</p></div></div><div class="foundation-intro"><div><h2>安静观看，内容优先</h2><p>沿用既定暖白、深灰绿与红色主动作。焦点用外轮廓，选中用底色与标记；不靠放大、声音或悬停才能发现操作。</p></div><div><h2>一份行为，两端呈现</h2><div class="inline">${button('立即播放', { variant: 'primary', glyph: 'play', action: 'play-demo' })}${button('已收藏', { variant: 'selected force-focus', glyph: 'check', action: 'favorite', extra: 'aria-pressed="true"' })}</div></div></div>` +
    section(
      '主题角色',
      `<div class="palette">${colors.map(([label, key]) => `<div class="swatch"><i style="background:var(--${key})"></i><p>${label}</p><code>${key}</code></div>`).join('')}</div>`,
    ) +
    section(
      '共享与差异',
      `<table class="common-table"><thead><tr><th>维度</th><th>桌面端</th><th>TV</th></tr></thead><tbody><tr><td>共享契约</td><td colspan="2">value / change / commit · selected · disabled · pending · error · 取消与来源恢复</td></tr><tr><td>动作目标 / 图标</td><td>44 / 20；紧凑次要操作 36</td><td>60 / 26；输入 60；选集 80</td></tr><tr><td>文字 / 间距</td><td>正文 16；元信息 14；间距 4–40</td><td>正文 22；元信息 20；间距 8–48</td></tr><tr><td>输入设备</td><td>鼠标、Tab、方向键、Enter、Esc</td><td>方向、确认、返回；输入编辑与导航分离</td></tr><tr><td>单选与弹层</td><td colspan="2">同一选择提交、关闭、取消规则；焦点变化不伪造数据变化</td></tr><tr><td>平台特例</td><td>hover 与图标提示；可拖动滑杆</td><td>必要操作常显；输入先进入编辑；遥控定位有预览</td></tr><tr><td>承载方式</td><td>Dialog 480；Sheet 440</td><td>Dialog 800；Sheet 640（1920 参考单位）</td></tr></tbody></table>`,
    ) +
    section(
      'Lucide',
      `<div class="icon-gallery">${['play', 'pause', 'search', 'bookmark', 'bell', 'settings', 'volume-2', 'maximize', 'chevron-down', 'check', 'x', 'circle-alert'].map((name) => sample(name, icon(name))).join('')}</div><p class="player-note">官方静态 SVG · 固定版本 0.468.0 · 24×24 / stroke 2 · 无手绘路径</p>`,
    ) +
    `<div class="contract"><span>颜色从 packages/ui/theme.json 生成</span><span>公共行为与页面业务分离</span><span>浏览器样板；NSH 宿主待实施验证</span></div>`
  );
}
function context() {
  return {
    icon,
    button,
    section,
    row,
    sample,
    state,
    escape,
    select,
    refresh,
    announce,
    openLayer,
  };
}
function foundation() {
  return foundationSheet(context()) + frequentFoundation(context());
}
function navigation() {
  return navigationSheet(context()) + discoveryNavigation(context());
}
function content() {
  return contentSheet(context()) + collectionContent(context()) + discoveryContent(context());
}
function feedback() {
  return feedbackSheet(context());
}
function render() {
  root.dataset.platform = state.platform;
  root.dataset.theme = state.theme;
  document
    .querySelectorAll('.review-bar [data-platform]')
    .forEach((el) =>
      el.setAttribute('aria-current', el.dataset.platform === state.platform ? 'page' : 'false'),
    );
  document.querySelector('#theme-toggle').textContent = state.theme === 'light' ? '深色' : '浅色';
  document
    .querySelector('#theme-toggle')
    .setAttribute('aria-label', state.theme === 'light' ? '切换深色' : '切换浅色');
  const title = state.platform === 'tv' ? 'TV 基础组件' : '桌面基础组件';
  const note =
    state.platform === 'tv'
      ? '1920 参考尺寸 · 方向 / 确认 / 返回（Esc） · 浏览器模拟焦点'
      : '键鼠输入 · 标准 44 / 紧凑 36 · 浅深主题共用';
  board.innerHTML =
    state.platform === 'common'
      ? common()
      : `<div class="board-heading"><div><h1>${title}</h1><p>${note}</p></div></div><nav class="sheet-nav" aria-label="组件分组">${[
          ['foundation', '基础'],
          ['controls', '按钮与选择'],
          ['forms', '输入与表单'],
          ['navigation', '导航'],
          ['layers', '弹层'],
          ['content', '内容'],
          ['cinema', '观看'],
          ['feedback', '反馈'],
        ]
          .map(
            ([key, label]) =>
              `<button data-sheet="${key}" aria-current="${state.sheet === key ? 'page' : 'false'}">${label}</button>`,
          )
          .join(
            '',
          )}</nav>${{ foundation, controls, forms, navigation, layers, content, cinema, feedback }[state.sheet]()}`;
  if (state.platform === 'tv')
    board
      .querySelectorAll(
        'input:not([type=range]):not([type=checkbox]):not([data-permanent-readonly]):not(:disabled)',
      )
      .forEach((el) => (el.readOnly = true));
  for (const mixed of document.querySelectorAll('input[type="checkbox"][aria-checked="mixed"]'))
    mixed.indeterminate = true;
  collectionAfterRender(context());
  frequentAfterRender(context());
  history.replaceState(
    null,
    '',
    `?platform=${state.platform}&sheet=${state.sheet}&theme=${state.theme}`,
  );
}
const focusable = 'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]';
function refresh(source = document.activeElement) {
  const old = typeof source === 'string' ? document.querySelector(source) : source;
  const selector =
    typeof source === 'string'
      ? source
      : old?.dataset.demoId
        ? `[data-demo-id="${CSS.escape(old.dataset.demoId)}"]`
        : old?.id
          ? `#${CSS.escape(old.id)}`
          : null;
  const sections = [...board.querySelectorAll('.spec-section')];
  const sectionIndex = sections.indexOf(old?.closest('.spec-section'));
  const rowIndex = [...(sections[sectionIndex]?.querySelectorAll('.spec-row') || [])].indexOf(
    old?.closest('.spec-row'),
  );
  const page = [window.scrollX, window.scrollY];
  const scrolls = [...document.querySelectorAll('[data-scroll-id]')].map((el) => [
    el.dataset.scrollId,
    el.scrollLeft,
    el.scrollTop,
  ]);
  render();
  for (const [id, left, top] of scrolls) {
    const el = document.querySelector(`[data-scroll-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollLeft = left;
      el.scrollTop = top;
    }
  }
  const visible = (el) =>
    el && !el.disabled && !el.closest('[hidden]') && el.getClientRects().length;
  let destination = selector && document.querySelector(selector);
  if (!visible(destination)) {
    const section = board.querySelectorAll('.spec-section')[sectionIndex];
    const scope =
      document.querySelector('dialog[open]') ||
      section?.querySelectorAll('.spec-row')[rowIndex] ||
      section ||
      board;
    destination = [...scope.querySelectorAll(focusable)].find(visible);
  }
  destination?.focus({ preventScroll: true });
  window.scrollTo(...page);
  destination?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function placePopup(trigger) {
  const popup = trigger.nextElementSibling;
  const rect = trigger.getBoundingClientRect();
  const margin = 12,
    gap = 10;
  popup.style.position = 'fixed';
  popup.style.minWidth = `${Math.min(rect.width, innerWidth - margin * 2)}px`;
  popup.style.maxWidth = `${Math.min(400, innerWidth - margin * 2)}px`;
  popup.style.maxHeight = `${Math.min(360, innerHeight - margin * 2)}px`;
  popup.style.top = '0';
  popup.style.left = '0';
  const below = innerHeight - rect.bottom - gap - margin;
  const above = rect.top - gap - margin;
  const up = popup.scrollHeight > below && above > below;
  popup.style.maxHeight = `${Math.max(60, Math.min(360, up ? above : below))}px`;
  const size = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - size.width - margin))}px`;
  popup.style.top = `${Math.max(margin, up ? rect.top - gap - size.height : rect.bottom + gap)}px`;
}
window.addEventListener('resize', () => closeSelect());
document.addEventListener(
  'scroll',
  (event) => {
    if (!event.target.closest?.('.popup')) closeSelect();
  },
  true,
);
function closeSelect(restore = false) {
  document.querySelectorAll('.select-trigger[aria-expanded=true]').forEach((trigger) => {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.nextElementSibling.hidden = true;
    if (restore) trigger.focus();
  });
}
let sourceFocus;
function openLayer(kind, source) {
  closeSelect();
  sourceFocus = source;
  const rangeStart = Math.floor((state.episode - 1) / 20) * 20 + 1;
  const rangeEnd = Math.min(72, rangeStart + 19);
  const rangeLabel = `${rangeStart}–${rangeEnd} 集`;
  (state.selectValues ||= {})['sheet-range'] = rangeLabel;
  const layer = document.createElement('dialog');
  layer.className = kind === 'sheet' ? 'sheet' : '';
  layer.setAttribute('aria-label', kind === 'sheet' ? '选集' : '移除观看记录');
  layer.innerHTML =
    kind === 'sheet'
      ? `<header><h2>选集</h2>${button('关闭选集', { glyph: 'x', iconOnly: true, action: 'close' })}</header><p>重返1998 · 全 72 集（演示）</p>${select('剧集范围', ['1–20 集', '21–40 集', '41–60 集', '61–72 集'], rangeLabel, 'sheet-range')}<div id="sheet-episodes">${episodes(rangeEnd - rangeStart + 1, rangeStart)}</div><div class="sheet-footer" role="status">当前第 ${state.episode} 集</div>`
      : dialogContent();
  document.querySelector('#overlay-root').append(layer);
  layer.showModal();
  layer.querySelector('[data-action=close]').focus();
  layer.addEventListener(
    'close',
    () => {
      layer.remove();
      sourceFocus?.focus();
    },
    { once: true },
  );
  layer.addEventListener('cancel', (event) => {
    if (layer.querySelector('[aria-expanded=true]')) {
      event.preventDefault();
      closeSelect(true);
    }
  });
}
const announce = (text) => {
  let output = document.querySelector('#board-feedback');
  if (!output) {
    output = document.createElement('p');
    output.id = 'board-feedback';
    output.className = 'player-note';
    output.setAttribute('role', 'status');
    board.append(output);
  }
  output.textContent = text;
};
document.addEventListener('click', (event) => {
  const platform = event.target.closest('.review-bar [data-platform]');
  if (platform) {
    state.platform = platform.dataset.platform;
    render();
    return;
  }
  if (event.target.closest('#theme-toggle')) {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    render();
    return;
  }
  const sheet = event.target.closest('[data-sheet]');
  if (sheet) {
    state.sheet = sheet.dataset.sheet;
    render();
    board.querySelector(`[data-sheet="${state.sheet}"]`)?.focus();
    return;
  }
  const trigger = event.target.closest('[data-select],[data-popup]');
  if (trigger) {
    if (trigger.disabled) return;
    const wasOpen = trigger.getAttribute('aria-expanded') === 'true';
    closeSelect();
    if (!wasOpen) {
      trigger.setAttribute('aria-expanded', 'true');
      trigger.nextElementSibling.hidden = false;
      placePopup(trigger);
      (
        trigger.nextElementSibling.querySelector('[aria-selected=true]:not(:disabled)') ||
        trigger.nextElementSibling.querySelector('button:not(:disabled)')
      )?.focus({ preventScroll: true });
    }
    return;
  }
  const option = event.target.closest('[data-option]');
  if (option) {
    if (option.disabled) return;
    (state.selectValues ||= {})[option.dataset.key] = option.dataset.option;
    const wrap = option.closest('.select-wrap');
    wrap.querySelector('.select-trigger span').textContent = option.dataset.option;
    wrap
      .querySelectorAll('[role=option]')
      .forEach((el) => el.setAttribute('aria-selected', el === option));
    closeSelect(true);
    if (option.dataset.key === 'sheet-range') {
      const start = Number(option.dataset.option.split('–')[0]);
      const finish = start === 61 ? 72 : start + 19;
      document.querySelector('#sheet-episodes').innerHTML = episodes(finish - start + 1, start);
      document.querySelector('#sheet-episodes button')?.focus();
    }
    return;
  }
  if (!event.target.closest('.select-wrap')) closeSelect();
  const tab = event.target.closest('[data-tab]');
  if (tab && !tab.disabled && tab.dataset.action !== 'nav-demo') {
    state.tab = tab.dataset.tab;
    const scope = tab.closest('.tabs');
    scope.querySelectorAll('[data-tab]').forEach((el) => {
      el.setAttribute('aria-selected', el === tab);
      el.tabIndex = el === tab ? 0 : -1;
    });
    scope.nextElementSibling.textContent = `当前分区：${state.tab}`;
    scope.nextElementSibling.setAttribute('aria-label', state.tab);
    return;
  }
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  if (target.matches('[role=menuitem]')) closeSelect(true);
  if (
    [
      handleDiscoveryAction,
      handleAccountAction,
      handleCollectionAction,
      handleCoverageAction,
      handleFrequentAction,
    ].some((handler) => handler(target.dataset.action, target, context()))
  )
    return;
  switch (target.dataset.action) {
    case 'nav-demo': {
      const group = target.dataset.navGroup,
        value = target.dataset.value;
      if (group === 'main') {
        state.navDemo = value;
        const nav = target.closest('nav');
        nav
          .querySelectorAll('button')
          .forEach((el) => el.setAttribute('aria-current', el === target ? 'page' : 'false'));
        document.querySelector('[data-nav-current]').textContent = value;
      } else if (group === 'section') {
        state.sectionDemo = value;
        target.parentElement.querySelectorAll('[role=tab]').forEach((el) => {
          el.setAttribute('aria-selected', el === target);
          el.tabIndex = el === target ? 0 : -1;
        });
        document.querySelector('[data-navigation-panel]').textContent = value;
      } else if (group === 'page' && value !== '加载更多') {
        state.pageDemo =
          value === '上一页'
            ? Math.max(1, state.pageDemo - 1)
            : value === '下一页'
              ? Math.min(3, state.pageDemo + 1)
              : Number(value);
        render();
        board.querySelector(`[data-nav-group=page][data-value="${state.pageDemo}"]`)?.focus();
      } else announce('导航动作演示，保留页面上下文；未请求数据。');
      break;
    }
    case 'content-demo':
      announce(
        target.dataset.value === 'remove-selection'
          ? '移除所选记录的动作演示；没有删除数据。'
          : '内容动作演示；未导航或请求媒体。',
      );
      break;
    case 'dismiss-feedback': {
      const toast = target.closest('.fb-toast');
      const next = toast.closest('.fb-toast-region').querySelector('.fb-caption');
      toast.remove();
      next.textContent = '提示已关闭，操作结果应保留在原位。';
      next.tabIndex = -1;
      next.focus();
      break;
    }
    case 'undo-feedback': {
      const toast = target.closest('.fb-toast');
      if (toast) {
        toast.querySelector('.fb-toast-copy').innerHTML =
          '<strong>已撤销</strong><span>演示状态，不写入数据</span>';
        target.disabled = true;
      } else {
        target.closest('.fb-inline').querySelector('span:not(.icon)').textContent =
          '已撤销（演示状态）';
        target.disabled = true;
      }
      break;
    }
    case 'retry-feedback': {
      const parent = target.closest('.fb-notice,.fb-inline,.fb-empty');
      if (parent) {
        let text = parent.querySelector('.fb-notice-copy p,.fb-demo,p');
        if (text) text.textContent = '仍未连接服务，可再次重试（演示）';
        else announce('重试动作演示；当前未连接服务。');
      }
      break;
    }
    case 'feedback-browse':
    case 'feedback-settings':
      announce('入口样式演示；未离开组件设计页。');
      break;
    case 'menu-command': {
      const command = target.dataset.value;
      const trigger = target.closest('.select-wrap').querySelector('[data-popup]');
      closeSelect(true);
      if (command === 'remove') openLayer('dialog', trigger);
      else announce('菜单命令演示；没有写入数据。');
      break;
    }
    case 'close-popup':
      closeSelect(true);
      break;
    case 'suggestion-state':
      state.suggestionMode = target.dataset.value;
      refresh(target);
      document.querySelector('#suggestion-query').focus();
      break;
    case 'suggestion-retry':
      state.suggestionMode = 'loading';
      refresh('[data-suggestion-state="ready"]');
      break;
    case 'suggestion-search':
      announce(`演示搜索：${state.suggestionQuery || '春山'}。未请求真实数据。`);
      break;
    case 'suggestion': {
      state.suggestionQuery = target.dataset.value;
      const input = document.querySelector('#suggestion-query');
      input.value = state.suggestionQuery;
      input.focus();
      document.querySelector('#search-suggestions').hidden = true;
      input.setAttribute('aria-expanded', 'false');
      announce(
        target.dataset.kind === 'actor'
          ? '演示进入演员作品；未播放视频。'
          : '演示查看短剧搜索结果；未请求服务。',
      );
      break;
    }

    case 'dialog':
      openLayer('dialog', target);
      break;
    case 'sheet':
      openLayer('sheet', target);
      break;
    case 'close':
      target.closest('dialog')?.close();
      break;
    case 'confirm':
      if (target.closest('dialog')) {
        target.closest('dialog').close();
        announce('已确认移除（仅演示，没有写入数据）。');
      } else announce('请用“打开确认对话框”体验焦点与取消。');
      break;
    case 'favorite': {
      const selected = target.getAttribute('aria-pressed') !== 'true';
      target.setAttribute('aria-pressed', selected);
      target.classList.toggle('selected', selected);
      target.innerHTML = icon(selected ? 'check' : 'bookmark') + (selected ? '已收藏' : '收藏');
      break;
    }
    case 'genre':
      state.genre = target.dataset.value;
      target.parentElement.querySelectorAll('button').forEach((el) => {
        el.classList.toggle('selected', el === target);
        el.setAttribute('aria-checked', el === target);
        el.tabIndex = el === target ? 0 : -1;
      });
      break;
    case 'auto-next':
      state.autoNext = !state.autoNext;
      target.setAttribute('aria-checked', state.autoNext);
      target.querySelector('.switch').setAttribute('aria-checked', state.autoNext);
      break;
    case 'clear-query':
      state.query = '';
      document.querySelector('#query').value = '';
      document.querySelector('#query').focus();
      break;
    case 'search': {
      state.query = document.querySelector('#query').value;
      document.querySelector('#query-status').textContent = state.query.trim()
        ? `演示搜索：${state.query}。未请求真实数据。`
        : '请输入剧名或演员后再搜索';
      break;
    }
    case 'retry':
      target.closest('.notice').querySelector('.status-text').innerHTML =
        '仍未连接服务<p>这是失败状态样板，可再次重试</p>';
      break;
    case 'reset-filters':
      announce('筛选已清空（演示）。');
      break;
    case 'episode':
      state.episode = Number(target.dataset.value);
      document.querySelectorAll('[data-action=episode]').forEach((el) => {
        const selected = Number(el.dataset.value) === state.episode;
        el.classList.toggle('selected', selected);
        el.setAttribute('aria-pressed', selected);
      });
      document.querySelectorAll('[data-current-episode]').forEach((el) => {
        el.textContent = `第 ${state.episode} 集`;
      });
      const nextEpisode = document.querySelector('[data-action=next-episode]');
      if (nextEpisode) nextEpisode.disabled = state.episode >= 72;
      if (target.closest('.sheet'))
        target
          .closest('.sheet')
          .querySelector('.sheet-footer').textContent = `已选择第 ${state.episode} 集（演示）`;
      else announce(`已选择第 ${state.episode} 集（演示）。`);
      break;
    case 'playback':
      state.playback = !state.playback;
      target.innerHTML = icon(state.playback ? 'pause' : 'play');
      target.setAttribute('aria-label', state.playback ? '暂停' : '播放');
      break;
    case 'next-episode':
      state.episode = state.episode >= 72 ? 72 : state.episode + 1;
      render();
      board.querySelector('[data-action=next-episode]')?.focus();
      break;
    case 'fullscreen-demo':
      announce('全屏按钮样式示例；此组件页不切换宿主窗口。');
      break;
    default:
      announce('动作样式演示；没有导航或数据写入。');
  }
});
document.addEventListener('submit', (event) => {
  event.preventDefault();
  event.target.querySelector('[data-action=search]')?.click();
});
document.addEventListener('input', (event) => {
  if (handleAccountInput(event, context())) return;
  if (event.target.id === 'suggestion-query') state.suggestionQuery = event.target.value;
  if (event.target.id === 'query') state.query = event.target.value;
  if (event.target.id === 'code-input')
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 6);
  if (event.target.type === 'range') {
    const range = event.target;
    globalThis.HongguoComponents.syncRange(range);
    if (range.id === 'seek') {
      const value = Number(range.value);
      const time = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
      range.setAttribute('aria-valuetext', `${time}，共 02:00`);
      document.querySelector('#seek-status').textContent = `预览 ${time}，结束调整后提交。`;
    }
  }
});
function commitRange(range) {
  range.dataset.committed = range.value;
  if (range.id === 'seek')
    document.querySelector('#seek-status').textContent =
      `已提交演示定位：${range.getAttribute('aria-valuetext')}。未调用媒体服务。`;
}
document.addEventListener('change', (event) => {
  if (handleFrequentChange(event, context())) return;
  if (handleCollectionChange(event, context())) return;
  if (event.target.id === 'mixed-check') event.target.removeAttribute('aria-checked');
  if (event.target.type === 'range' && state.platform !== 'tv') commitRange(event.target);
});
document.addEventListener('click', (event) => {
  if (
    state.platform === 'tv' &&
    event.target.matches('input[readonly]:not([data-permanent-readonly]):not(:disabled)')
  ) {
    event.target.readOnly = false;
    event.target.classList.add('editing');
  }
});
document.addEventListener('focusout', (event) => {
  if (
    state.platform === 'tv' &&
    event.target.matches('input:not([type=range]):not([type=checkbox])')
  ) {
    event.target.readOnly = true;
    event.target.classList.remove('editing');
  }
});
document.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  const active = document.activeElement;
  if (
    [handleAccountKey, handleCollectionKey, handleCoverageKey, handleFrequentKey].some((handler) =>
      handler(event, context()),
    )
  )
    return;
  if (
    state.platform === 'tv' &&
    active.matches('.dx-table-scroll') &&
    ['ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    event.preventDefault();
    active.scrollBy({ left: event.key === 'ArrowRight' ? 240 : -240, behavior: 'instant' });
    return;
  }
  if (
    state.platform === 'tv' &&
    event.key === 'Enter' &&
    active.matches('input[type=checkbox]:not(:disabled)')
  ) {
    event.preventDefault();
    active.click();
    return;
  }
  if (event.key === 'Enter' && active.id === 'query' && !active.readOnly) {
    event.preventDefault();
    document.querySelector('[data-action=search]').click();
    return;
  }
  if (active.id === 'suggestion-query' && event.key === 'Enter' && !active.readOnly) {
    event.preventDefault();
    document.querySelector('[data-action=suggestion-search]')?.click();
    return;
  }
  if (
    active.id === 'suggestion-query' &&
    event.key === 'ArrowDown' &&
    active.getAttribute('aria-expanded') === 'true'
  ) {
    event.preventDefault();
    document.querySelector('#search-suggestions button:not(:disabled)')?.focus();
    return;
  }
  if (state.platform === 'tv' && active.matches('input[type=range]')) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (active.dataset.editing === 'true') {
        commitRange(active);
        delete active.dataset.editing;
      } else {
        active.dataset.editing = 'true';
        if (active.id === 'seek')
          document.querySelector('#seek-status').textContent = '左右预览；确认提交，返回取消。';
      }
      return;
    }
    if (active.dataset.editing === 'true') {
      if (event.key === 'Escape') {
        event.preventDefault();
        active.value = active.dataset.committed;
        active.dispatchEvent(new Event('input', { bubbles: true }));
        delete active.dataset.editing;
        if (active.id === 'seek')
          document.querySelector('#seek-status').textContent =
            `已取消调整，保留 ${active.getAttribute('aria-valuetext')}。`;
      } else if (['ArrowUp', 'ArrowDown', 'Tab'].includes(event.key)) event.preventDefault();
      return;
    }
  }
  if (event.key === 'Escape') {
    const suggestions = document.querySelector('#search-suggestions:not([hidden])');
    if (suggestions) {
      event.preventDefault();
      const input = document.querySelector('#suggestion-query');
      input.focus();
      suggestions.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    const opened = document.querySelector('.select-trigger[aria-expanded=true]');
    if (opened) {
      event.preventDefault();
      event.stopPropagation();
      closeSelect(true);
      return;
    }
    if (active.matches('input.editing')) {
      event.preventDefault();
      active.readOnly = true;
      active.classList.remove('editing');
      return;
    }
  }
  if (
    active.matches('[role=radio]') &&
    ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
  ) {
    event.preventDefault();
    const items = [...active.parentElement.children].filter((el) => !el.disabled && !el.hidden);
    const forward = ['ArrowRight', 'ArrowDown'].includes(event.key);
    const next = items[(items.indexOf(active) + (forward ? 1 : -1) + items.length) % items.length];
    next.focus();
    next.click();
    return;
  }
  const option = active.closest('[role=option],[role=menuitem]');
  if (option && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const items = [...option.parentElement.querySelectorAll('button:not(:disabled)')];
    items[
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (items.indexOf(option) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
            items.length
    ].focus();
    return;
  }
  if (
    active.matches('[data-tab]') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  ) {
    event.preventDefault();
    const items = [...active.parentElement.children].filter((el) => !el.disabled && !el.hidden);
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (items.indexOf(active) + (event.key === 'ArrowRight' ? 1 : -1) + items.length) %
            items.length;
    items[index].focus();
    items[index].click();
    return;
  }
  if (state.platform !== 'tv' || !active.closest('#board,dialog')) return;
  if (active.matches('input:not([type=range]):not([type=checkbox])')) {
    if (
      event.key === 'Enter' &&
      active.readOnly &&
      !active.hasAttribute('data-permanent-readonly')
    ) {
      event.preventDefault();
      active.readOnly = false;
      active.classList.add('editing');
      return;
    }
    if (!active.readOnly) return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const scope = active.closest('dialog') || board;
  const current = active.getBoundingClientRect();
  const cx = current.x + current.width / 2,
    cy = current.y + current.height / 2;
  const horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key);
  const positive = ['ArrowRight', 'ArrowDown'].includes(event.key);
  let best,
    score = Infinity;
  scope
    .querySelectorAll(
      'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]',
    )
    .forEach((el) => {
      if (el === active || el.closest('[hidden]')) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dx = rect.x + rect.width / 2 - cx,
        dy = rect.y + rect.height / 2 - cy;
      const along = horizontal ? dx : dy,
        cross = horizontal ? dy : dx;
      if ((positive ? along : -along) <= 1) return;
      const value = Math.abs(along) + Math.abs(cross) * 3;
      if (value < score) {
        best = el;
        score = value;
      }
    });
  best?.focus();
});
render();

document.addEventListener('focusin', (event) => {
  handleFrequentFocus(event, context());
  if (event.target.id === 'suggestion-query') {
    document.querySelector('#search-suggestions').hidden = false;
    event.target.setAttribute('aria-expanded', 'true');
  }
});
document.addEventListener('focusout', (event) => {
  const shell = event.target.closest('.suggestion-shell');
  if (shell && !shell.contains(event.relatedTarget)) {
    shell.querySelector('[role=listbox]').hidden = true;
    shell.querySelector('input').setAttribute('aria-expanded', 'false');
  }
});
