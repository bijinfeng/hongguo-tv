// Design specimens only. The shared controller delegates events into this module.
// Motion: inherited press/focus feedback; state swaps are immediate, no timers.
const countries = [
  ['+86', '中国大陆'],
  ['+852', '中国香港'],
  ['+853', '中国澳门'],
  ['+886', '中国台湾'],
  ['+65', '新加坡'],
  ['+81', '日本'],
];
const startupPages = ['推荐', '排行榜', '新剧', '历史', '收藏'];
const defaults = () => ({
  qr: 'waiting',
  country: '+86',
  phone: '13800000000',
  code: '',
  codeState: 'idle',
  login: 'idle',
  inputError: '',
  inputView: '',
  inputKind: 'code',
  inputDraft: '',
  inputSource: '',
  phoneScan: 'waiting',
  startPage: '推荐',
  confirmedStartPage: '推荐',
  settingState: 'idle',
  reduceMotion: false,
});
const model = (ctx) => (ctx.state.account ||= defaults());
const escape = (ctx, value) => ctx.escape(String(value));
function action(ctx, label, name, value = '', options = {}) {
  const id = options.id || `${name}-${value || 'main'}`;
  return ctx.button(label, {
    ...options,
    action: `ax-${name}`,
    extra: `data-value="${escape(ctx, value)}" data-demo-id="ax-${escape(ctx, id)}" ${options.extra || ''}`,
  });
}
function picker(ctx, label, name, options, value) {
  return `<div class="select-wrap ax-picker"><button type="button" class="select-trigger" data-popup="ax-${name}" data-demo-id="ax-${name}" aria-label="${label}" aria-haspopup="listbox" aria-expanded="false"><span>${escape(ctx, options.find(([key]) => key === value)?.[1] || value)}</span>${ctx.icon('chevron-down')}</button><div class="popup" role="listbox" aria-label="${label}" hidden>${options.map(([key, text]) => `<button type="button" role="option" aria-selected="${key === value}" data-action="ax-${name}" data-value="${escape(ctx, key)}" data-demo-id="ax-${name}-${escape(ctx, key)}">${escape(ctx, text)}${key === value ? ctx.icon('check') : ''}</button>`).join('')}</div></div>`;
}
const status = (text, error = false, id = '') =>
  `<p ${id ? `id="${id}"` : ''} class="ax-status ${error ? 'field-error' : 'field-hint'}" role="status">${text}</p>`;
function stageChoices(ctx, name, choices, selected) {
  return `<div class="ax-demo-controls" aria-label="${name === 'qr-state' ? '扫码' : name === 'code-state' ? '验证码' : '表单'}演示状态">${choices.map(([key, text]) => action(ctx, text, name, key, { variant: key === selected ? 'selected' : 'quiet', extra: `aria-pressed="${key === selected}"` })).join('')}</div>`;
}

function qrSpec(ctx, data) {
  const copy = {
    preparing: '正在准备二维码',
    waiting: '等待扫码',
    confirm: '已扫码，等待手机确认',
    expired: '二维码已过期',
    failed: '二维码读取失败',
    unavailable: '当前扫码不可用',
    complete: '演示流程已完成',
  }[data.qr];
  const next = {
    preparing: ['模拟准备完成', 'waiting'],
    waiting: ['模拟已扫码', 'confirm'],
    confirm: ['模拟手机确认', 'complete'],
    expired: ['刷新演示二维码', 'preparing'],
    failed: ['重新准备', 'preparing'],
    unavailable: ['重新检查', 'preparing'],
    complete: ['重新演示', 'preparing'],
  }[data.qr];
  return `<div class="ax-qr-layout"><div class="ax-scan-placeholder" role="img" aria-label="不可扫描的二维码占位"><span>扫码占位</span><small>无可扫描内容</small></div><div class="ax-qr-copy"><strong>${copy}</strong>${action(ctx, next[0], 'qr-state', next[1], { id: 'qr-next', variant: 'primary' })}<span class="field-hint">不创建二维码或登录会话</span></div></div>${stageChoices(
    ctx,
    'qr-state',
    [
      ['preparing', '准备中'],
      ['waiting', '等待扫码'],
      ['confirm', '等待手机确认'],
      ['expired', '已过期'],
      ['failed', '读取失败'],
      ['unavailable', '不可用'],
    ],
    data.qr,
  )}`;
}

function tvInput(ctx, data) {
  if (ctx.state.platform !== 'tv') return '';
  const kind = data.inputKind;
  const label = kind === 'phone' ? '手机号' : '验证码';
  if (data.inputView === 'keypad')
    return `<div class="ax-input-adapter" data-ax-input-region><div class="ax-adapter-heading"><strong>输入演示${label}</strong>${action(ctx, '取消输入', 'input-cancel', '', { id: 'input-cancel', variant: 'quiet' })}</div><output class="ax-digit-output" aria-label="待确认的演示${label}" aria-live="polite">${escape(ctx, data.inputDraft) || '尚未输入'}</output><div class="ax-keypad" aria-label="${label}数字键盘">${['1', '2', '3', '4', '5', '6', '7', '8', '9', 'delete', '0', 'done'].map((key) => action(ctx, key === 'delete' ? '删除' : key === 'done' ? '完成' : key, 'keypad', key, { variant: key === 'done' ? 'primary' : '' })).join('')}</div><span class="field-hint">确认输入；返回取消并保留原值</span></div>`;
  if (data.inputView === 'phone-scan') {
    const copy = {
      waiting: '等待手机输入',
      expired: '手机输入已过期',
      failed: '手机输入读取失败',
      unavailable: '手机输入暂不可用',
    }[data.phoneScan];
    return `<div class="ax-input-adapter" data-ax-input-region><div class="ax-adapter-heading"><strong>手机辅助输入${label}</strong>${action(ctx, '取消手机输入', 'input-cancel', '', { id: 'input-cancel', variant: 'quiet' })}</div>${status(`${copy} · 无配对会话`)}<div class="inline">${data.phoneScan === 'waiting' ? action(ctx, '模拟手机填入', 'phone-fill', '', { variant: 'primary' }) : action(ctx, '重新等待', 'phone-scan-state', 'waiting')}${action(ctx, '改用数字键盘', 'input-open', `keypad:${kind}`)}</div>${stageChoices(
      ctx,
      'phone-scan-state',
      [
        ['expired', '模拟过期'],
        ['failed', '读取失败'],
        ['unavailable', '不可用'],
      ],
      data.phoneScan,
    )}</div>`;
  }
  return `<div class="ax-input-tools">${action(ctx, '手机号键盘', 'input-open', 'keypad:phone')}${action(ctx, '验证码键盘', 'input-open', 'keypad:code')}${action(ctx, '手机辅助输入', 'input-open', 'phone-scan:code')}</div>`;
}

function mfaSpec(ctx, data) {
  if (!data.login.startsWith('mfa')) return '';
  const copy = {
    mfa: '需要额外短信验证。接收号码与短信内容由真实服务提供，演示不生成。',
    'mfa-checking': '正在检查演示验证结果',
    'mfa-failed': '尚未确认，保留当前输入后重试',
    'mfa-expired': '演示验证会话已过期，请重新验证',
  }[data.login];
  return `<div class="ax-mfa"><strong>额外短信验证</strong>${status(copy, ['mfa-failed', 'mfa-expired'].includes(data.login))}<div class="inline">${action(ctx, data.login === 'mfa-expired' ? '重新验证输入' : '检查演示结果', 'mfa-check', '', { disabled: data.login === 'mfa-checking' })}${action(ctx, '取消短信验证', 'login-state', 'idle', { variant: 'quiet' })}</div>${stageChoices(
    ctx,
    'login-state',
    [
      ['mfa-failed', '模拟未确认'],
      ['mfa-expired', '模拟过期'],
      ['complete', '模拟验证通过'],
    ],
    data.login,
  )}</div>`;
}

function phoneSpec(ctx, data) {
  const codeCopy = {
    idle: '仅使用演示数字，不发送真实短信',
    pending: '正在获取演示验证码',
    sent: '演示已发送；可填入 000000',
    failed: '演示获取失败，输入仍保留，可重试',
    wait: '暂时不能重试；等待状态由演示步骤结束',
  }[data.codeState];
  const pending = data.login === 'pending';
  const copy =
    {
      idle: '',
      pending: '正在验证演示输入',
      failed: '演示验证失败，手机号和验证码仍保留',
      complete: '演示验证通过；未登录真实账号',
    }[data.login] || '';
  return `<div class="ax-phone-form"><div class="ax-phone-fields"><div class="field"><label>国家或地区</label>${picker(
    ctx,
    '国家或地区',
    'country',
    countries.map(([key, name]) => [key, `${name} ${key}`]),
    data.country,
  )}</div><div class="field"><label for="ax-phone">演示手机号</label><input id="ax-phone" data-demo-id="ax-phone" data-ax-field="phone" class="ui-input" inputmode="numeric" autocomplete="off" maxlength="15" value="${escape(ctx, data.phone)}" ${pending ? 'disabled' : ''} /></div></div><div class="ax-code-row"><div class="field"><label for="ax-code">演示验证码</label><input id="ax-code" data-demo-id="ax-code" data-ax-field="code" class="ui-input" inputmode="numeric" autocomplete="off" maxlength="6" value="${escape(ctx, data.code)}" placeholder="6 位演示数字" aria-describedby="ax-code-status ax-login-error" ${pending ? 'disabled' : ''} /></div>${action(ctx, data.codeState === 'pending' ? '获取中' : data.codeState === 'wait' ? '等待重试' : data.codeState === 'failed' ? '重新获取' : '获取演示验证码', 'code-send', '', { disabled: pending || ['pending', 'wait'].includes(data.codeState) })}</div>${status(codeCopy, data.codeState === 'failed', 'ax-code-status')}${data.codeState === 'pending' ? `<div class="ax-demo-controls">${action(ctx, '模拟已发送', 'code-state', 'sent')}${action(ctx, '模拟获取失败', 'code-state', 'failed')}${action(ctx, '模拟等待重试', 'code-state', 'wait')}</div>` : data.codeState === 'wait' ? action(ctx, '结束等待（演示）', 'code-state', 'idle', { variant: 'quiet' }) : ''}${data.inputError ? status(escape(ctx, data.inputError), true, 'ax-login-error') : '<span id="ax-login-error" hidden></span>'}${tvInput(ctx, data)}<div class="inline">${action(ctx, pending ? '验证中' : data.login === 'failed' ? '重试演示验证' : '验证演示输入', 'login-submit', '', { variant: 'primary', disabled: pending || data.login.startsWith('mfa') })}${pending ? action(ctx, '取消验证', 'login-state', 'idle', { variant: 'quiet' }) : ''}</div>${copy ? status(copy, data.login === 'failed') : ''}${
    pending
      ? stageChoices(
          ctx,
          'login-state',
          [
            ['failed', '模拟验证失败'],
            ['mfa', '需要短信验证'],
            ['complete', '模拟验证通过'],
          ],
          data.login,
        )
      : ''
  }${mfaSpec(ctx, data)}</div>`;
}

function settingsSpec(ctx, data) {
  const settingRow = (label, control, description = '') =>
    `<div class="ax-setting-row"><div class="ax-setting-label"><strong>${label}</strong>${description ? `<span class="field-hint">${description}</span>` : ''}</div><div class="ax-setting-control">${control}</div></div>`;
  return `<div class="ax-settings">${settingRow(
    '启动页面',
    picker(
      ctx,
      '启动页面',
      'start-page',
      startupPages.map((page) => [page, page]),
      data.startPage,
    ),
    '下次启动生效',
  )}${data.settingState === 'failed' ? `<div class="ax-setting-feedback">${status('演示保存失败，已恢复上次确认值', true)}${action(ctx, '重试保存演示偏好', 'setting-retry')}</div>` : ''}${settingRow('减少动态效果', `<button type="button" class="switch-hit" role="switch" aria-label="演示减少动态效果" aria-checked="${data.reduceMotion}" data-action="ax-motion" data-demo-id="ax-motion"><span class="switch" aria-hidden="true" aria-checked="${data.reduceMotion}"><span></span></span></button>`)}${settingRow('版本', '<span class="ax-readonly">设计原型</span>')}${settingRow('播放解码', action(ctx, '由宿主提供', 'unavailable', '', { disabled: true }), '当前样板不连接宿主解码能力')}<div class="ax-demo-controls">${action(ctx, '模拟保存失败', 'setting-fail', '', { variant: 'quiet' })}${action(ctx, '确认已保存（演示）', 'setting-confirm', '', { variant: 'quiet' })}</div></div>`;
}

export function accountForms(ctx) {
  const data = model(ctx);
  return (
    ctx.section(
      '账号输入组合',
      `<p class="field-hint ax-demo-note">仅演示，不发送登录或短信请求；请勿输入个人信息。</p>${ctx.row('扫码状态', qrSpec(ctx, data))}${ctx.row('手机号与验证', phoneSpec(ctx, data))}`,
    ) + ctx.section('设置行', ctx.row('偏好与可用性', settingsSpec(ctx, data)))
  );
}

function returnToPicker(target) {
  return target.closest('.select-wrap')?.querySelector('.select-trigger') || target;
}
function returnToInput(data) {
  return data.inputSource ? `[data-demo-id="${data.inputSource}"]` : `#ax-${data.inputKind}`;
}

export function handleAccountAction(name, target, ctx) {
  if (!name.startsWith('ax-')) return false;
  if (target.disabled) return true;
  const data = model(ctx);
  const value = target.dataset.value || '';
  let source = target;
  switch (name) {
    case 'ax-qr-state':
      data.qr = value;
      break;
    case 'ax-country':
      data.country = value;
      source = returnToPicker(target);
      break;
    case 'ax-code-send':
      if (['pending', 'wait'].includes(data.codeState)) return true;
      data.codeState = 'pending';
      source = '[data-demo-id="ax-code-state-sent"]';
      break;
    case 'ax-code-state':
      data.codeState = value;
      source =
        value === 'wait'
          ? '[data-demo-id="ax-code-state-idle"]'
          : '[data-demo-id="ax-code-send-main"]';
      break;
    case 'ax-login-submit':
      if (data.login === 'pending' || data.login.startsWith('mfa')) return true;
      data.inputError =
        data.phone.length < 7
          ? '请输入至少 7 位演示手机号'
          : data.code.length !== 6
            ? '请输入 6 位演示验证码'
            : '';
      if (data.inputError)
        source = document.querySelector(data.phone.length < 7 ? '#ax-phone' : '#ax-code');
      else {
        data.login = 'pending';
        source = '[data-demo-id="ax-login-state-idle"]';
      }
      break;
    case 'ax-login-state':
      data.login = value;
      data.inputError = '';
      source = value.startsWith('mfa')
        ? '[data-demo-id="ax-mfa-check-main"]'
        : '[data-demo-id="ax-login-submit-main"]';
      break;
    case 'ax-mfa-check':
      data.login = data.login === 'mfa-expired' ? 'idle' : 'mfa-checking';
      source =
        data.login === 'idle'
          ? '[data-demo-id="ax-login-submit-main"]'
          : '[data-demo-id="ax-login-state-idle"]';
      break;
    case 'ax-input-open': {
      if (data.login === 'pending' || data.login.startsWith('mfa')) return true;
      const [view, kind] = value.split(':');
      data.inputView = view;
      data.inputKind = kind;
      data.inputDraft = data[kind];
      data.phoneScan = 'waiting';
      data.inputSource = target.dataset.demoId || '';
      source =
        view === 'keypad' ? '[data-demo-id="ax-keypad-1"]' : '[data-demo-id="ax-phone-fill-main"]';
      break;
    }
    case 'ax-input-cancel':
      data.inputView = '';
      source = returnToInput(data);
      break;
    case 'ax-keypad':
      if (value === 'done') {
        data[data.inputKind] = data.inputDraft;
        data.inputView = '';
        source = returnToInput(data);
      } else if (value === 'delete') data.inputDraft = data.inputDraft.slice(0, -1);
      else if (data.inputDraft.length < (data.inputKind === 'code' ? 6 : 15))
        data.inputDraft += value;
      break;
    case 'ax-phone-fill':
      data[data.inputKind] = data.inputKind === 'code' ? '000000' : '13800000000';
      data.inputView = '';
      source = returnToInput(data);
      break;
    case 'ax-phone-scan-state':
      data.phoneScan = value;
      break;
    case 'ax-start-page':
      data.startPage = value;
      data.settingState = 'idle';
      source = returnToPicker(target);
      break;
    case 'ax-setting-confirm':
      data.confirmedStartPage = data.startPage;
      data.settingState = 'idle';
      ctx.announce('演示偏好已确认；不会写入设备设置。');
      break;
    case 'ax-setting-fail':
      data.retryStartPage = data.startPage;
      data.startPage = data.confirmedStartPage;
      data.settingState = 'failed';
      break;
    case 'ax-setting-retry':
      data.startPage = data.retryStartPage || data.startPage;
      data.settingState = 'idle';
      source = document.querySelector('[data-demo-id="ax-start-page"]');
      break;
    case 'ax-motion':
      data.reduceMotion = !data.reduceMotion;
      break;
    default:
      return false;
  }
  ctx.refresh(source);
  return true;
}

export function handleAccountInput(event, ctx) {
  const input = event.target;
  const field = input.dataset.axField;
  if (!['phone', 'code'].includes(field)) return false;
  const data = model(ctx);
  input.value = input.value.replace(/\D/g, '').slice(0, field === 'code' ? 6 : 15);
  data[field] = input.value;
  data.inputError = '';
  return true;
}

export function handleAccountKey(event, ctx) {
  const data = model(ctx);
  if (
    event.isComposing ||
    event.key !== 'Escape' ||
    !data.inputView ||
    !event.target.closest('[data-ax-input-region]')
  )
    return false;
  event.preventDefault();
  data.inputView = '';
  ctx.refresh(returnToInput(data));
  return true;
}
