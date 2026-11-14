export function formExtras(ctx) {
  const { icon, button, row, sample, state, escape } = ctx;
  const mode = state.suggestionMode || 'ready';
  const entries =
    mode === 'long'
      ? Array.from({ length: 18 }, (_, i) => ({
          title: ['春山不负', '重返1998', '长夜有声'][i % 3],
          kind: 'drama',
          suffix: ` · 建议 ${i + 1}`,
        }))
      : [
          { title: '春山不负', kind: 'drama' },
          { title: '演员作品入口', kind: 'actor' },
        ];
  const suggestions = ['ready', 'long'].includes(mode)
    ? entries
        .map(
          ({ title, kind, suffix = '' }) =>
            `<button type="button" role="option" aria-selected="false" data-action="suggestion" data-value="${escape(title)}" data-kind="${kind}">${icon('search')}<span>${escape(title + suffix)}</span><small class="suggestion-kind">${kind === 'actor' ? '演员' : '短剧'}</small>${icon('chevron-right')}</button>`,
        )
        .join('')
    : `<div class="suggestion-state" role="status">${mode === 'loading' ? '正在读取搜索建议…' : mode === 'empty' ? '暂无建议，可以直接搜索' : '建议读取失败，输入已保留'}</div>${mode === 'error' ? button('重试建议', { action: 'suggestion-retry' }) : ''}`;
  return (
    row(
      '搜索建议',
      `<div class="spec-state-tools" role="group" aria-label="搜索建议演示状态">${[
        ['ready', '有建议'],
        ['loading', '读取中'],
        ['empty', '无建议'],
        ['error', '失败'],
        ['long', '长列表'],
      ]
        .map(([value, label]) =>
          button(label, {
            action: 'suggestion-state',
            variant: mode === value ? 'selected' : 'quiet',
            extra: `data-value="${value}" data-suggestion-state="${value}" data-demo-id="suggestion-state-${value}" aria-pressed="${mode === value}"`,
          }),
        )
        .join(
          '',
        )}</div><div class="suggestion-shell"><label for="suggestion-query">短剧、演员</label><div class="input-with-icon">${icon('search')}<input id="suggestion-query" class="ui-input" value="${escape(state.suggestionQuery ?? '春山')}" role="combobox" aria-controls="search-suggestions" aria-autocomplete="list" aria-expanded="false" /></div><div id="search-suggestions" class="suggestion-list" role="listbox" aria-label="搜索建议" hidden>${suggestions}</div>${button('直接搜索', { action: 'suggestion-search' })}</div>`,
    ) +
    row(
      '只读与帮助',
      `<div class="samples">${sample('只读 · 可选择文字', '<div class="field"><label for="readonly-input">当前身份</label><input id="readonly-input" class="ui-input" value="游客" readonly data-permanent-readonly /></div>')}${sample('验证码', '<div class="field"><label for="code-input">短信验证码</label><input id="code-input" class="ui-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="6 位验证码" aria-describedby="code-hint" /><span id="code-hint" class="field-hint">不自动提交，填写后确认</span></div>')}</div>`,
    ) +
    row(
      '选择状态',
      `<div class="samples">${sample('未选', '<label class="check-label"><input type="checkbox" />选择这条记录</label>')}${sample('部分选中', '<label class="check-label"><input id="mixed-check" type="checkbox" aria-checked="mixed" />部分记录已选</label>')}${sample('禁用', '<label class="check-label"><input type="checkbox" checked disabled />暂不可选择</label>')}${sample('不可用偏好', '<button class="switch-hit" role="switch" aria-label="自动连播暂不可用" aria-checked="false" disabled><span class="switch" aria-hidden="true"><span></span></span></button>')}</div>`,
    )
  );
}

export function anchoredLayers(ctx) {
  const { icon, button, row } = ctx;
  return (
    row(
      '命令菜单',
      `<div class="select-wrap"><button class="select-trigger" data-popup="commands" aria-haspopup="menu" aria-expanded="false">更多操作${icon('chevron-down')}</button><div class="popup" role="menu" aria-label="剧目操作" hidden>${[
        ['查看详情', 'detail'],
        ['加入收藏', 'favorite'],
        ['移除记录', 'remove'],
      ]
        .map(
          ([label, value]) =>
            `<button role="menuitem" data-action="menu-command" data-value="${value}">${label}</button>`,
        )
        .join('')}</div></div>`,
    ) +
    row(
      'Popover',
      `<div class="select-wrap"><button class="select-trigger" data-popup="progress" aria-haspopup="dialog" aria-expanded="false">观看进度${icon('chevron-down')}</button><div class="popup progress-popover" role="dialog" aria-label="观看进度" hidden><strong>重返1998</strong><p>第 12 集 · 看到 00:36</p>${button('关闭进度提示', { variant: 'quiet', action: 'close-popup' })}</div></div>`,
    )
  );
}
