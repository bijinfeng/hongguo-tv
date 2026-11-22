import type { Account, AccountCommand } from '@hongguo/core-client';

/** The same regions and bounds as the core Passport protocol. */
export const accountCountries = [
  { value: '+86', label: '中国大陆 +86', min: 11, max: 11 },
  { value: '+852', label: '中国香港 +852', min: 8, max: 8 },
  { value: '+853', label: '中国澳门 +853', min: 8, max: 8 },
  { value: '+886', label: '中国台湾 +886', min: 9, max: 10 },
  { value: '+60', label: '马来西亚 +60', min: 9, max: 10 },
  { value: '+65', label: '新加坡 +65', min: 8, max: 8 },
  { value: '+62', label: '印度尼西亚 +62', min: 10, max: 13 },
  { value: '+95', label: '缅甸 +95', min: 9, max: 10 },
  { value: '+63', label: '菲律宾 +63', min: 7, max: 10 },
  { value: '+84', label: '越南 +84', min: 9, max: 10 },
  { value: '+855', label: '柬埔寨 +855', min: 8, max: 9 },
  { value: '+81', label: '日本 +81', min: 9, max: 11 },
  { value: '+82', label: '韩国 +82', min: 8, max: 11 },
  { value: '+971', label: '阿拉伯联合酋长国 +971', min: 9, max: 9 },
];

export interface AccountUiState {
  method: 'qr' | 'phone';
  busy: boolean;
  error: string;
  /** Which field the error belongs to, so the dialog can attach it to that input. */
  errorField?: 'phone' | 'code';
  country: string;
  phone: string;
  code: string;
  retryIn: number;
  expired: boolean;
  login?: Account['login'];
}
interface AccountStateOptions {
  account: () => Account | undefined;
  command: (command: AccountCommand, abort?: AbortSignal) => Promise<Account>;
  onChange: (state: AccountUiState) => void;
  now?: () => number;
  schedule?: (work: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
}
const terminal = new Set(['expired', 'cancelled', 'failed']);

/** Owns attempts, never credentials or the authoritative account/library snapshots. */
export function createAccountState(options: AccountStateOptions) {
  let state: AccountUiState = {
    method: 'qr',
    busy: false,
    error: '',
    country: '+86',
    phone: '',
    code: '',
    retryIn: 0,
    expired: false,
  };
  let generation = 0;
  let active = true;
  let disposed = false;
  let attempt: Account['login'];
  let controller: AbortController | undefined;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  let cooldownUntil = 0;
  let cancelId: string | undefined;
  let cancelling: Promise<void> | undefined;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? setTimeout;
  const clear = options.clear ?? clearTimeout;
  const update = (next: Partial<AccountUiState>) => {
    state = { ...state, ...next };
    options.onChange(state);
  };
  const owns = (owned: number) => !disposed && active && generation === owned;
  const clearTimers = () => {
    if (pollTimer !== undefined) clear(pollTimer);
    if (tickTimer !== undefined) clear(tickTimer);
    pollTimer = tickTimer = undefined;
  };
  const invalidate = () => {
    generation++;
    controller?.abort();
    controller = undefined;
    clearTimers();
    const previous = attempt ?? options.account()?.login;
    attempt = undefined;
    update({
      busy: false,
      expired: false,
      login: undefined,
      retryIn: Math.max(0, Math.ceil((cooldownUntil - now()) / 1000)),
    });
    if (active && !disposed && state.retryIn) {
      const owned = generation;
      tickTimer = schedule(() => tick(owned), 1000);
    }
    // A failed cancel remains a barrier even after the local attempt has been removed.
    if (previous && !terminal.has(previous.state) && !options.account()?.logged_in)
      cancelId = previous.id;
    if (cancelling) return cancelling;
    if (!cancelId) return Promise.resolve();
    const id = cancelId;
    const work = options
      .command({ action: 'cancel', id })
      .then((account) => {
        if (!account.logged_in && account.login?.id === id && !terminal.has(account.login.state))
          throw new Error('登录取消结果尚未确认，请重试。');
        if (cancelId === id) cancelId = undefined;
      })
      .catch((cause) => {
        if (!disposed)
          update({
            error: cause instanceof Error ? cause.message : '登录取消结果尚未确认，请重试。',
          });
        throw cause;
      })
      .finally(() => {
        if (cancelling === work) cancelling = undefined;
      });
    cancelling = work;
    return work;
  };
  const tick = (owned: number) => {
    if (!owns(owned)) return;
    const expired =
      attempt?.state === 'expired' || (!!attempt?.expires_at && now() >= attempt.expires_at);
    update({ retryIn: Math.max(0, Math.ceil((cooldownUntil - now()) / 1000)), expired });
    if (expired) {
      void invalidate().catch(() => {});
      update({ busy: false, expired: true });
      return;
    }
    if (attempt || state.retryIn) tickTimer = schedule(() => tick(owned), 1000);
  };
  const accept = (account: Account, owned: number) => {
    if (!owns(owned)) return;
    attempt = account.logged_in ? undefined : account.login;
    if (attempt?.retry_after) cooldownUntil = now() + attempt.retry_after * 1000;
    update({
      login: attempt,
      error: account.error || attempt?.error || '',
      expired: attempt?.state === 'expired',
    });
    if (tickTimer !== undefined) clear(tickTimer);
    tick(owned);
    if (attempt?.method === 'qr' && !terminal.has(attempt.state) && !state.expired) {
      const id = attempt.id;
      pollTimer = schedule(() => {
        pollTimer = undefined;
        if (owns(owned) && attempt?.id === id) void execute({ action: 'qr_poll', id }, owned);
      }, 1800);
    }
  };
  const execute = async (command: AccountCommand, owned = generation) => {
    if (!owns(owned) || state.busy) return;
    controller = new AbortController();
    const abort = controller;
    update({ busy: true, error: '' });
    try {
      const account = await options.command(command, abort.signal);
      if (owns(owned) && !abort.signal.aborted) accept(account, owned);
    } catch (cause) {
      if (owns(owned) && !abort.signal.aborted)
        update({ error: cause instanceof Error ? cause.message : '账号操作未完成，请重试。' });
    } finally {
      if (owns(owned)) {
        if (controller === abort) controller = undefined;
        update({ busy: false });
      }
    }
  };
  const replace = async (command: AccountCommand) => {
    if (!active || disposed) return;
    const cancelled = invalidate();
    const owned = generation;
    update({ busy: true });
    try {
      await cancelled;
      if (owns(owned)) {
        update({ busy: false });
        if (options.account()?.logged_in && command.action !== 'logout') return;
        await execute(command, owned);
      }
    } catch {
      if (owns(owned)) update({ busy: false });
    }
  };
  const validPhone = () => {
    const region = accountCountries.find((country) => country.value === state.country);
    const valid =
      region &&
      /^[0-9]+$/.test(state.phone) &&
      state.phone.length >= region.min &&
      state.phone.length <= region.max &&
      state.country.length - 1 + state.phone.length <= 15 &&
      (state.country !== '+86' || /^1[3-9][0-9]{9}$/.test(state.phone));
    if (!valid) update({ error: '请输入正确的手机号。', errorField: 'phone' });
    return valid;
  };
  const startPhone = (send_code: boolean) => {
    if (state.busy || (send_code && state.retryIn > 0) || !validPhone()) return Promise.resolve();
    return replace({
      action: 'phone_start',
      country_code: state.country,
      phone: state.phone,
      send_code,
    });
  };
  return {
    state: () => state,
    setMethod(method: AccountUiState['method']) {
      if (method === state.method) return;
      void invalidate().catch(() => {});
      update({ method, error: '', code: '' });
    },
    setCountry(country: string) {
      if (!accountCountries.some((item) => item.value === country) || state.country === country)
        return;
      void invalidate().catch(() => {});
      update({ country, code: '', error: '' });
    },
    setPhone(phone: string) {
      if (phone === state.phone) return;
      void invalidate().catch(() => {});
      update({ phone, code: '', error: '' });
    },
    setCode: (code: string) => update({ code, error: '' }),
    startQr: () => (state.busy ? Promise.resolve() : replace({ action: 'qr_start' })),
    sendCode: () => startPhone(true),
    useExistingCode: () => startPhone(false),
    submit() {
      if (!attempt || attempt.method !== 'phone' || terminal.has(attempt.state) || state.expired) {
        update({ error: '先获取验证码，或选择使用 App 已有验证码。', errorField: 'code' });
        return Promise.resolve();
      }
      if (!/^[0-9]{4,8}$/.test(state.code)) {
        update({ error: '请输入正确的验证码。', errorField: 'code' });
        return Promise.resolve();
      }
      return execute({ action: 'phone_login', id: attempt.id, code: state.code });
    },
    verify() {
      if (attempt?.state !== 'mfa') return Promise.resolve();
      return execute({ action: 'phone_verify', id: attempt.id });
    },
    logout: () => replace({ action: 'logout' }),
    cancel: () => invalidate(),
    setActive(next: boolean) {
      if (next === active) return;
      active = next;
      if (!next) void invalidate().catch(() => {});
      else tick(generation);
    },
    dispose() {
      if (disposed) return;
      void invalidate().catch(() => {});
      disposed = true;
    },
  };
}
