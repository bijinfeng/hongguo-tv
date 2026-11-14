// Design specimens only. Identity, selection and focus use business IDs.
const titles = {
  return: { title: '重返1998', cover: 'return', note: '全 72 集' },
  spring: { title: '春山不负', cover: 'spring', note: '第一季 · 更新至 48 集' },
  night: { title: '长夜有声', cover: 'night', note: '全 36 集' },
  'spring-second': { title: '春山不负 · 第二季', cover: 'spring', note: '第二季' },
  'spring-third': { title: '春山不负 · 第三季', cover: 'spring', note: '尚未上线' },
};
const initialIds = ['return', 'spring', 'night'];
const moreIds = ['spring-second', 'spring-third'];
const demo = (name) => `[data-demo-id="${name}"]`;
const get = (ctx) =>
  (ctx.state.collection ||= {
    loaded: [...initialIds],
    appended: false,
    detail: null,
    anchor: null,
    records: [...initialIds],
    selected: ['night'],
    managing: true,
    confirmation: null,
  });

function confirmation(ctx, data) {
  const pending = data.confirmation;
  if (!pending) return '';
  const title = pending.scope === 'collection' ? '移除收藏？' : '移除观看记录？';
  const description =
    pending.kind === 'clear'
      ? '清空当前设备的全部观看记录。累计观看统计保留。'
      : pending.ids.length === 1
        ? `将移除《${titles[pending.ids[0]].title}》的${pending.scope === 'collection' ? '收藏' : '本地观看记录'}。`
        : `将移除所选 ${pending.ids.length} 条本地观看记录。`;
  return `<dialog class="cx-confirm" aria-labelledby="cx-confirm-heading" aria-describedby="cx-confirm-description"><h2 id="cx-confirm-heading">${title}</h2><p id="cx-confirm-description">${description}</p><div class="dialog-actions">${ctx.button('取消', { action: 'cx-cancel', extra: 'data-demo-id="cx-cancel" autofocus' })}${ctx.button(pending.kind === 'clear' ? '清空' : '移除', { variant: 'destructive', action: 'cx-confirm', extra: 'data-demo-id="cx-confirm"' })}</div></dialog>`;
}

function collection(ctx, data) {
  const { button, escape } = ctx;
  const cards = data.loaded
    .map((id) => {
      const item = titles[id];
      return `<article class="cx-card"><button type="button" class="cx-card-action" data-action="cx-detail" data-id="${id}" data-demo-id="cx-card-${id}" aria-label="查看${escape(item.title)}详情"><img src="../assets/${item.cover}.png" alt="" /><strong>${escape(item.title)}</strong><span class="content-meta">${item.note}</span></button></article>`;
    })
    .join('');
  const item = data.detail && titles[data.detail];
  return `<div class="cx-collection"><div class="cx-scroll" data-scroll-id="cx-catalog" aria-label="收藏列表" ${item ? 'hidden' : ''}>${cards || '<p class="cx-empty">暂无收藏</p>'}</div>${item ? `<div class="cx-detail"><img src="../assets/${item.cover}.png" alt="" /><div><h3>${escape(item.title)}</h3><p class="content-meta">${item.note}</p><div class="inline">${button('返回收藏', { glyph: 'arrow-left', action: 'cx-back', extra: 'data-demo-id="cx-back"' })}${button('移除收藏', { variant: 'quiet', action: 'cx-remove-collection', extra: `data-id="${data.detail}" data-demo-id="cx-remove-collection"` })}</div></div></div>` : `<div class="cx-collection-footer">${button('加载更多', { action: 'cx-append', disabled: data.appended, extra: 'data-demo-id="cx-append"' })}${data.appended ? '<span class="content-meta" role="status">已显示全部收藏</span>' : ''}${button('重置样例', { variant: 'quiet', action: 'cx-reset-collection', extra: 'data-demo-id="cx-reset-collection"' })}</div>`}</div>`;
}

function records(ctx, data) {
  const { button, escape } = ctx;
  const selected = data.selected.filter((id) => data.records.includes(id));
  return `<div class="cx-records"><div class="cx-record-toolbar">${data.managing ? `<label class="check-label"><input type="checkbox" data-cx-select="all" data-demo-id="cx-select-all" ${!data.records.length ? 'disabled' : ''} />全选</label><span class="content-meta" role="status">已选 ${selected.length} 条</span>${button('完成', { action: 'cx-exit', extra: 'data-demo-id="cx-manage"' })}` : button('管理记录', { action: 'cx-manage', disabled: !data.records.length, extra: 'data-demo-id="cx-manage"' })}</div><div class="cx-record-scroll" data-scroll-id="cx-records">${data.records
    .map((id) => {
      const item = titles[id];
      return `<article class="content-result-row content-record-row ${data.managing && selected.includes(id) ? 'content-row-selected' : ''}" data-cx-record="${id}">${data.managing ? `<label class="content-record-selection"><input type="checkbox" data-cx-select="${id}" data-demo-id="cx-select-${id}" ${selected.includes(id) ? 'checked' : ''} aria-label="选择${escape(item.title)}观看记录" /></label>` : ''}<img class="cx-record-cover" src="../assets/${item.cover}.png" alt="" /><div class="content-result-body"><h3>${escape(item.title)}</h3><p>第 ${id === 'spring' ? 1 : id === 'return' ? 12 : 4} 集 · 看到 00:36</p></div>${button('移除', { variant: 'quiet', action: 'cx-remove-one', extra: `data-id="${id}" data-demo-id="cx-remove-${id}" aria-label="移除${escape(item.title)}观看记录"` })}</article>`;
    })
    .join(
      '',
    )}${data.records.length ? '' : '<p class="cx-empty" role="status">暂无观看记录</p>'}</div><div class="cx-record-footer">${data.managing ? button('移除所选记录', { variant: 'destructive', action: 'cx-remove-selected', disabled: !selected.length, extra: 'data-demo-id="cx-remove-selected"' }) : ''}${button('清空当前设备记录', { variant: 'quiet', action: 'cx-clear', disabled: !data.records.length, extra: 'data-demo-id="cx-clear"' })}${button('重置样例', { variant: 'quiet', action: 'cx-reset', extra: 'data-demo-id="cx-reset"' })}</div></div>`;
}

export function collectionContent(ctx) {
  const data = get(ctx);
  return (
    ctx.section(
      '集合与焦点恢复',
      ctx.row('收藏集合', collection(ctx, data)) + ctx.row('观看记录管理', records(ctx, data)),
    ) +
    ctx.section(
      '观看统计',
      ctx.row(
        '累计值',
        '<dl class="cx-statistics" aria-label="累计观看统计样例"><div><dt>观看短剧</dt><dd>12 <span>部</span></dd></div><div><dt>观看集数</dt><dd>86 <span>集</span></dd></div><div><dt>观看时长</dt><dd>3 <span>小时</span> 24 <span>分钟</span></dd></div></dl><p class="content-meta">累计统计样例，独立于当前观看记录。</p>',
      ),
    ) +
    confirmation(ctx, data)
  );
}

function ask(ctx, pending) {
  get(ctx).confirmation = pending;
  ctx.refresh(demo('cx-cancel'));
}

function restoreCatalog(ctx, id) {
  const data = get(ctx);
  data.detail = null;
  data.restoreScroll = true;
  ctx.refresh(demo(id && data.loaded.includes(id) ? `cx-card-${id}` : 'cx-reset-collection'));
  collectionAfterRender(ctx);
}

export function handleCollectionAction(action, target, ctx) {
  if (!action.startsWith('cx-')) return false;
  const data = get(ctx);
  const id = target.dataset.id;
  const source = target.dataset.demoId;
  if (action === 'cx-detail') {
    const scroller = document.querySelector('[data-scroll-id="cx-catalog"]');
    data.anchor = { id, left: scroller.scrollLeft, top: scroller.scrollTop };
    data.detail = id;
    ctx.refresh(demo('cx-back'));
  } else if (action === 'cx-back') {
    restoreCatalog(ctx, data.anchor?.id);
  } else if (action === 'cx-append') {
    if (data.appended) return true;
    data.loaded.push(...moreIds.filter((item) => !data.loaded.includes(item)));
    data.appended = true;
    ctx.refresh(demo(`cx-card-${moreIds[0]}`));
    document
      .querySelector(demo(`cx-card-${moreIds[0]}`))
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    ctx.announce('已追加 2 项，原有收藏保留');
  } else if (action === 'cx-reset-collection') {
    data.loaded = [...initialIds];
    data.appended = false;
    data.anchor = null;
    ctx.refresh(demo('cx-reset-collection'));
  } else if (action === 'cx-remove-collection') {
    ask(ctx, { scope: 'collection', ids: [id], kind: 'one', source });
  } else if (action === 'cx-manage' || action === 'cx-exit') {
    data.managing = action === 'cx-manage';
    if (!data.managing) data.selected = [];
    ctx.refresh(demo('cx-manage'));
  } else if (['cx-remove-one', 'cx-remove-selected', 'cx-clear'].includes(action)) {
    const ids =
      action === 'cx-clear'
        ? [...data.records]
        : action === 'cx-remove-one'
          ? [id]
          : data.selected.filter((item) => data.records.includes(item));
    if (ids.length)
      ask(ctx, { scope: 'records', ids, kind: action === 'cx-clear' ? 'clear' : 'remove', source });
  } else if (action === 'cx-cancel') {
    const pending = data.confirmation;
    data.confirmation = null;
    ctx.refresh(demo(pending.source));
  } else if (action === 'cx-confirm') {
    const pending = data.confirmation;
    if (!pending) return true;
    const list = pending.scope === 'collection' ? data.loaded : data.records;
    const firstIndex = list.findIndex((item) => pending.ids.includes(item));
    const survivors = list.filter((item) => !pending.ids.includes(item));
    const next = survivors[Math.min(firstIndex, survivors.length - 1)];
    data.confirmation = null;
    if (pending.scope === 'collection') {
      data.loaded = survivors;
      restoreCatalog(ctx, next);
    } else {
      data.records = survivors;
      data.selected = data.selected.filter((item) => survivors.includes(item));
      ctx.refresh(demo(next ? `cx-${data.managing ? 'select' : 'remove'}-${next}` : 'cx-reset'));
    }
    ctx.announce(
      `已移除 ${pending.ids.length} ${pending.scope === 'collection' ? '项收藏' : '条观看记录'}`,
    );
  } else if (action === 'cx-reset') {
    data.records = [...initialIds];
    data.selected = [];
    ctx.refresh(demo('cx-reset'));
    ctx.announce('观看记录样例已重置，累计统计保留');
  } else return false;
  return true;
}

export function handleCollectionChange(event, ctx) {
  const id = event.target.dataset.cxSelect;
  if (!id) return false;
  const data = get(ctx);
  if (id === 'all') data.selected = event.target.checked ? [...data.records] : [];
  else if (event.target.checked) data.selected = [...new Set([...data.selected, id])];
  else data.selected = data.selected.filter((item) => item !== id);
  ctx.refresh(demo(id === 'all' ? 'cx-select-all' : `cx-select-${id}`));
  return true;
}

export function handleCollectionKey(event, ctx) {
  const data = get(ctx);
  if (event.key === 'Escape' && data.confirmation) {
    event.preventDefault();
    handleCollectionAction('cx-cancel', document.activeElement, ctx);
    return true;
  }
  if (event.key === 'Escape' && data.detail && !data.confirmation) {
    event.preventDefault();
    restoreCatalog(ctx, data.anchor?.id);
    return true;
  }
  const card = event.target.closest('[data-action="cx-detail"]');
  if (
    !card ||
    !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
  )
    return false;
  const cards = [...card.closest('.cx-scroll').querySelectorAll('[data-action="cx-detail"]')];
  const current = cards.indexOf(card);
  const isTV = ctx.state.platform === 'tv';
  if (isTV && ['ArrowUp', 'ArrowDown'].includes(event.key)) return false;
  const columns = isTV
    ? 1
    : getComputedStyle(card.closest('.cx-scroll')).gridTemplateColumns.split(' ').length;
  const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[event.key];
  const index =
    event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : current + offset;
  if (index < 0 || index >= cards.length) {
    event.preventDefault();
    return true;
  }
  event.preventDefault();
  cards[index].focus({ preventScroll: true });
  cards[index].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

export function collectionAfterRender(ctx) {
  const data = get(ctx);
  const all = document.querySelector('[data-cx-select="all"]');
  if (all) {
    const count = data.selected.filter((id) => data.records.includes(id)).length;
    all.checked = data.records.length > 0 && count === data.records.length;
    all.indeterminate = count > 0 && count < data.records.length;
    all.setAttribute('aria-checked', all.indeterminate ? 'mixed' : String(all.checked));
  }
  const dialog = document.querySelector('.cx-confirm');
  if (dialog && !dialog.open) {
    dialog.showModal();
    dialog.querySelector('[data-action="cx-cancel"]').focus();
  }
  if (data.restoreScroll) {
    const scroller = document.querySelector('[data-scroll-id="cx-catalog"]');
    if (scroller && data.anchor) {
      scroller.scrollLeft = data.anchor.left;
      scroller.scrollTop = data.anchor.top;
      document.activeElement
        ?.closest('.cx-card')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    data.restoreScroll = false;
  }
}
