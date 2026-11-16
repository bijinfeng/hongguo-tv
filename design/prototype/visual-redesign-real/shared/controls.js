/* Browser design adapter. Both the product prototype and component board consume this module. */
(() => {
  const escape = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
    );
  const aliases = {
    home: 'house',
    chart: 'chart-no-axes-column-increasing',
    calendar: 'calendar-days',
    next: 'skip-forward',
    back: 'chevron-left',
    forward: 'chevron-right',
    close: 'x',
    refresh: 'refresh-cw',
    volume: 'volume-2',
    mute: 'volume-x',
    fullscreen: 'maximize',
    screen: 'monitor',
    qr: 'qr-code',
    trash: 'trash-2',
    down: 'chevron-down',
  };
  const icon = (name, extra = '') =>
    `<span class="icon ${escape(extra)}" aria-hidden="true">${globalThis.HongguoIcons?.[aliases[name] || name] || globalThis.HongguoIcons?.info || ''}</span>`;
  const button = (
    label,
    {
      variant = '',
      glyph,
      action,
      extra = '',
      disabled = false,
      iconOnly = false,
      className = '',
      value = '',
      type = 'button',
    } = {},
  ) =>
    `<button type="${type}" class="ui-button ${variant
      .split(' ')
      .map((token) => (token === 'danger' ? 'destructive' : token))
      .join(
        ' ',
      )} ${iconOnly ? 'icon-only' : ''} ${className}" ${action ? `data-action="${escape(action)}"` : ''} ${value ? `data-value="${escape(value)}"` : ''} ${disabled ? 'disabled' : ''} ${iconOnly ? `aria-label="${escape(label)}" title="${escape(label)}"` : ''} ${extra}>${glyph ? icon(glyph) : ''}${iconOnly ? '' : label}</button>`;
  const syncRange = (range) => {
    if (range?.type !== 'range') return;
    const min = Number(range.min || 0);
    const max = Number(range.max || 100);
    const fill =
      max > min ? Math.max(0, Math.min(100, ((Number(range.value) - min) / (max - min)) * 100)) : 0;
    range.style.setProperty('--fill', `${fill}%`);
  };
  const syncRanges = (root) => root.querySelectorAll('input[type="range"]').forEach(syncRange);
  globalThis.HongguoComponents = Object.freeze({ escape, icon, button, syncRange, syncRanges });
})();
