// Forward component specimens. No request, persistence, clipboard or host command.
const defaults = () => ({
  expanded: false,
  open: ['playback'],
  chips: ['悬疑', '2026', '已完结'],
  preferences: { next: true, motion: false },
  preferenceError: false,
  toolbar: 'refresh',
});
const model = (ctx) => (ctx.state.frequent ||= defaults());
const marker = (id) => `[data-demo-id="hf-${id}"]`;

export function frequentFoundation(ctx) {
  const { section, row, button, icon, state } = ctx;
  const data = model(ctx);
  const synopsis =
    '离家多年的主人公回到熟悉的小城，重新面对家人、旧友和未完成的约定。随着一封旧信出现，过去的误会逐渐有了答案。他决定留下来，认真听完每个人的故事，也为自己选择新的生活。老街即将改建，曾经一起长大的伙伴各有打算，有人想守住旧店，有人期待离开。主人公在一次次相聚中发现，记忆中的小城并没有停在原地。为了兑现多年以前的约定，他们重新走过熟悉的街巷，寻找旧信里没有写出的答案。故事围绕重逢、选择与和解展开，人物之间的关系也随着每次坦诚的交谈慢慢改变。这段简介仅作为长文本设计样例。';
  return (
    section(
      '布局配方',
      row(
        '纵向与换行',
        '<div class="hf-stack"><strong>春山不负</strong><div class="hf-inline"><span>古装</span><span>更新至 48 集</span><span>单集约 2 分钟</span></div></div>',
      ) +
        row(
          '等分与对齐',
          '<dl class="hf-grid"><div><dt>剧集</dt><dd>48 集</dd></div><div><dt>状态</dt><dd>更新中</dd></div><div><dt>来源</dt><dd>演示数据</dd></div></dl>',
        ),
    ) +
    section(
      '文本展开',
      row(
        '长文与短文',
        `<div class="hf-copy"><p id="hf-synopsis" class="${data.expanded ? '' : 'hf-clamped'}">${synopsis}</p>${button(data.expanded ? '收起简介' : '展开简介', { variant: 'quiet', action: 'hf-expand', extra: `aria-expanded="${data.expanded}" aria-controls="hf-synopsis" data-demo-id="hf-expand"` })}<p class="type-meta">多年后重返故乡，一封旧信让往事重现。</p></div>`,
      ),
    ) +
    section(
      '折叠分组',
      row(
        '可同时展开',
        `<div class="hf-accordion">${[
          ['playback', '播放偏好', '同组设置在原位展开，关闭分组后不改变已经选择的值。', false],
          [
            'source',
            '来源信息',
            '来源、采样时间和缺失值由调用方提供；不把缓存内容当作实时数据。',
            false,
          ],
          ['unavailable', '暂无更多信息', '', true],
        ]
          .map(
            ([id, title, copy, disabled]) =>
              `<section class="hf-disclosure"><h4><button type="button" class="ui-button quiet hf-disclosure-trigger" data-action="hf-disclose" data-value="${id}" data-demo-id="hf-disclose-${id}" aria-expanded="${data.open.includes(id)}" aria-controls="hf-panel-${id}" id="hf-trigger-${id}" ${disabled ? 'disabled' : ''}>${title}${icon('chevron-down')}</button></h4><div id="hf-panel-${id}" role="region" aria-labelledby="hf-trigger-${id}" ${data.open.includes(id) ? '' : 'hidden'}><p>${copy}</p></div></section>`,
          )
          .join('')}</div>`,
      ),
    ) +
    section(
      '资源链接与输入提示',
      row(
        '外部资源',
        '<div class="hf-inline"><a class="hf-link" href="https://github.com/aston314/hongguo-tv" target="_blank" rel="noopener noreferrer">参考项目源码（浏览器打开）</a><span class="hf-link hf-link-disabled" role="link" aria-disabled="true">暂无来源链接</span></div>',
      ) +
        row(
          '已有操作的提示',
          `<div class="hf-key-hints">${state.platform === 'tv' ? '<span><kbd>确认</kbd>执行操作</span><span><kbd>返回</kbd>关闭当前弹层</span>' : '<span><kbd>Enter</kbd>确认操作</span><span><kbd>Esc</kbd>关闭当前弹层</span>'}</div>`,
        ),
    )
  );
}

export function frequentControls(ctx) {
  const { section, row, button, icon, escape } = ctx;
  const data = model(ctx);
  return (
    section(
      '已选条件',
      row(
        '逐项移除',
        `<div class="hf-chips" role="group" aria-label="已选条件样例">${data.chips.map((value) => button(value, { glyph: 'x', action: 'hf-remove-chip', extra: `data-value="${escape(value)}" data-demo-id="hf-chip-${escape(value)}" aria-label="移除条件：${escape(value)}"` })).join('') || '<span role="status">未设置筛选条件</span>'}</div><div class="hf-inline hf-actions">${button('清空条件', { variant: 'quiet', action: 'hf-clear-chips', disabled: !data.chips.length })}${button('重置样例', { variant: 'quiet', action: 'hf-reset-chips', extra: 'data-demo-id="hf-reset-chips"' })}</div>`,
      ),
    ) +
    section(
      '操作栏',
      row(
        '常用与更多',
        `<div class="hf-toolbar" role="toolbar" aria-label="片库操作样例">${button('刷新', { action: 'hf-command', extra: 'data-value="refresh" data-demo-id="hf-tool-refresh"' })}${button('管理', { action: 'hf-command', extra: 'data-value="manage" data-demo-id="hf-tool-manage"' })}<span class="hf-toolbar-separator" role="separator" aria-orientation="vertical"></span>${button('处理中', { disabled: true })}<div class="select-wrap"><button type="button" class="select-trigger" data-popup="hf-more" aria-haspopup="menu" aria-expanded="false" data-demo-id="hf-tool-more">更多${icon('chevron-down')}</button><div class="popup" role="menu" aria-label="更多片库操作" hidden>${button('查看来源', { action: 'hf-command', extra: 'role="menuitem" data-value="source"' })}${button('暂无可用排序', { disabled: true, extra: 'role="menuitem"' })}</div></div></div>`,
      ),
    )
  );
}

export function frequentForms(ctx) {
  const { section, row, button } = ctx;
  const data = model(ctx);
  return section(
    '表单分组',
    row(
      '关联偏好',
      `<fieldset class="hf-fieldset" aria-describedby="hf-group-note${data.preferenceError ? ' hf-group-error' : ''}"><legend>播放偏好</legend><p id="hf-group-note" class="type-meta">立即生效的偏好样例，不写入设备设置。</p>${[
        ['next', '自动播放下一集'],
        ['motion', '减少动态效果'],
      ]
        .map(
          ([id, label]) =>
            `<label class="check-label"><input type="checkbox" data-hf-pref="${id}" data-demo-id="hf-pref-${id}" ${data.preferences[id] ? 'checked' : ''} />${label}</label>`,
        )
        .join(
          '',
        )}${data.preferenceError ? '<p class="field-error" id="hf-group-error" role="status">未能保存偏好，已恢复上一次的值。</p>' : ''}</fieldset><div class="hf-inline hf-actions">${button('模拟保存失败', { variant: 'quiet', action: 'hf-pref-fail' })}${data.preferenceError ? button('关闭错误样例', { variant: 'quiet', action: 'hf-pref-recover' }) : ''}</div>`,
    ),
  );
}

export function frequentAfterRender(ctx) {
  const toolbar = document.querySelector('.hf-toolbar');
  if (!toolbar) return;
  const items = [
    ...toolbar.querySelectorAll(':scope > button:not(:disabled), :scope > .select-wrap > button'),
  ];
  const current = marker(`tool-${model(ctx).toolbar}`);
  items.forEach(
    (item, i) =>
      (item.tabIndex =
        ctx.state.platform === 'tv' ||
        item.matches(current) ||
        (!items.some((el) => el.matches(current)) && i === 0)
          ? 0
          : -1),
  );
}

export function handleFrequentAction(action, target, ctx) {
  if (!action.startsWith('hf-')) return false;
  const data = model(ctx);
  if (action === 'hf-expand') data.expanded = !data.expanded;
  else if (action === 'hf-disclose') {
    const id = target.dataset.value;
    data.open = data.open.includes(id)
      ? data.open.filter((value) => value !== id)
      : [...data.open, id];
    target.setAttribute('aria-expanded', data.open.includes(id));
    document.querySelector(`#hf-panel-${id}`).hidden = !data.open.includes(id);
    return true;
  } else if (action === 'hf-remove-chip') {
    const index = data.chips.indexOf(target.dataset.value);
    data.chips.splice(index, 1);
    ctx.refresh(
      data.chips.length
        ? marker(`chip-${data.chips[Math.min(index, data.chips.length - 1)]}`)
        : marker('reset-chips'),
    );
    ctx.announce(`已移除条件：${target.dataset.value}（演示）`);
    return true;
  } else if (action === 'hf-clear-chips' || action === 'hf-reset-chips') {
    data.chips = action === 'hf-clear-chips' ? [] : defaults().chips;
    ctx.refresh(marker('reset-chips'));
    return true;
  } else if (action === 'hf-pref-fail') {
    if (data.previousPreference) data.preferences = { ...data.previousPreference };
    data.preferenceError = true;
  } else if (action === 'hf-pref-recover') data.preferenceError = false;
  else if (action === 'hf-command') {
    const commands = { refresh: '刷新', manage: '管理', source: '查看来源' };
    ctx.announce(`${commands[target.dataset.value]}操作样例，不发出请求。`);
    return true;
  }
  ctx.refresh(target);
  return true;
}

export function handleFrequentChange(event, ctx) {
  if (!event.target.matches('[data-hf-pref]')) return false;
  const data = model(ctx);
  data.previousPreference = { ...data.preferences };
  data.preferences[event.target.dataset.hfPref] = event.target.checked;
  data.preferenceError = false;
  ctx.refresh(event.target);
  return true;
}

export function handleFrequentFocus(event, ctx) {
  if (!event.target.matches('[data-demo-id^="hf-tool-"]')) return;
  model(ctx).toolbar = event.target.dataset.demoId.replace('hf-tool-', '');
  frequentAfterRender(ctx);
}

export function handleFrequentKey(event, ctx) {
  const active = document.activeElement;
  if (ctx.state.platform === 'tv') return false;
  let items;
  if (
    active.matches('.hf-disclosure-trigger') &&
    ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  )
    items = [
      ...active.closest('.hf-accordion').querySelectorAll('.hf-disclosure-trigger:not(:disabled)'),
    ];
  if (
    active.closest('.hf-toolbar') &&
    !active.closest('.popup') &&
    ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
  )
    items = [
      ...active
        .closest('.hf-toolbar')
        .querySelectorAll(':scope > button:not(:disabled), :scope > .select-wrap > button'),
    ];
  if (!items) return false;
  event.preventDefault();
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (items.indexOf(active) +
            (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
            items.length) %
          items.length;
  items[index].focus();
  if (active.closest('.hf-toolbar')) {
    model(ctx).toolbar = items[index].dataset.demoId.replace('hf-tool-', '');
    frequentAfterRender(ctx);
  }
  return true;
}
