import { signal, type Signal } from 'nsh';
import * as platform from 'nsh';
import { bindDiagnosticsConsent } from './diagnostics';

/** Appearance follows the system by default; the two fixed schemes stay explicit choices. */
export type ThemeMode = 'system' | 'dark' | 'light';
/** Speeds the player already offers; a stored value stays one of them. */
export type PlaybackRate = '0.75' | '1' | '1.25' | '1.5' | '2';

export const PLAYBACK_RATES: PlaybackRate[] = ['0.75', '1', '1.25', '1.5', '2'];

export interface Preferences {
  theme: ThemeMode;
  autoplayNext: boolean;
  rememberPosition: boolean;
  defaultRate: PlaybackRate;
  quietWatching: boolean;
  autoCheckUpdates: boolean;
  /** Off until the user turns it on; nothing leaves the device before that. */
  diagnosticsReporting: boolean;
}

/** Only settings with real behavior live here; host-only abilities stay out of the page. */
export const defaultPreferences: Preferences = {
  theme: 'system',
  autoplayNext: true,
  rememberPosition: true,
  defaultRate: '1',
  quietWatching: true,
  autoCheckUpdates: true,
  diagnosticsReporting: false,
};

export const SETTINGS_STORAGE_KEY = 'settings.v1';

const themes: ThemeMode[] = ['system', 'dark', 'light'];

/**
 * Reads each field on its own so a value stored before a preference existed still loads the
 * others: a missing or mistyped field takes its default and keeps the rest as saved. Only a
 * non-object payload is unrecognized.
 */
const readPreferences = (value: unknown): Preferences | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const pick = <K extends keyof Preferences>(key: K): Preferences[K] => {
    const stored = input[key];
    const fallback = defaultPreferences[key];
    return typeof stored === typeof fallback ? (stored as Preferences[K]) : fallback;
  };
  const theme = themes.includes(input.theme as ThemeMode)
    ? (input.theme as ThemeMode)
    : defaultPreferences.theme;
  const defaultRate = PLAYBACK_RATES.includes(input.defaultRate as PlaybackRate)
    ? (input.defaultRate as PlaybackRate)
    : defaultPreferences.defaultRate;
  return {
    theme,
    autoplayNext: pick('autoplayNext'),
    rememberPosition: pick('rememberPosition'),
    defaultRate,
    quietWatching: pick('quietWatching'),
    autoCheckUpdates: pick('autoCheckUpdates'),
    diagnosticsReporting: pick('diagnosticsReporting'),
  };
};

/** The storage slice this module needs; the host implementation is the app's device storage. */
export interface SettingsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

type HostStorage = SettingsStorage;

/** The device storage is absent when the module runs in a plain Node tooling test. */
const hostStorage = (): HostStorage | undefined => (platform as { Storage?: HostStorage }).Storage;

const hostColorScheme = (theme: ThemeMode): void => {
  (platform as { setColorScheme?: (scheme: ThemeMode) => void }).setColorScheme?.(theme);
};

export interface SettingsOptions {
  storage?: SettingsStorage;
  /** Applying appearance is the host's job; tests can observe it without a native window. */
  applyColorScheme?: (theme: ThemeMode) => void;
  /**
   * Tells the host whether diagnostics reporting is on. Resolving keeps the preference; a
   * rejection (or a non-boolean answer) leaves it unchanged and reports the row's error.
   */
  applyDiagnosticsConsent?: (enabled: boolean) => Promise<boolean>;
}

export interface Settings {
  theme: Signal<ThemeMode>;
  autoplayNext: Signal<boolean>;
  rememberPosition: Signal<boolean>;
  defaultRate: Signal<PlaybackRate>;
  quietWatching: Signal<boolean>;
  autoCheckUpdates: Signal<boolean>;
  diagnosticsReporting: Signal<boolean>;
  /** True once stored values (or their absence) were read; writes wait for it. */
  loaded: Signal<boolean>;
  /** Last read or write failure, shown next to the setting it affects. */
  error: Signal<string>;
  /** The preference whose save failed, or undefined when the failure is a read. */
  failedKey: Signal<keyof Preferences | undefined>;
  setTheme(theme: ThemeMode): void;
  setAutoplayNext(value: boolean): void;
  setRememberPosition(value: boolean): void;
  setDefaultRate(value: PlaybackRate): void;
  setQuietWatching(value: boolean): void;
  setAutoCheckUpdates(value: boolean): void;
  /**
   * Turns diagnostics reporting on or off, asking the host first: a host that refuses leaves
   * the stored preference as it was, so the surface never shows a state the host did not take.
   */
  setDiagnosticsReporting(value: boolean): Promise<boolean>;
  /** True while every preference equals its default, so a reset cannot pretend to act. */
  isDefault(): boolean;
  reset(): void;
  /** Reads again after a failed read, or retries the latest failed write. */
  retry(): void;
  /** Resolves after the queued writes settle, so shutdown does not drop a preference. */
  flush(): Promise<void>;
}

/**
 * One installation's real preferences: device storage is the only source, and the
 * surface never claims success the storage did not confirm.
 */
export function createSettings(options: SettingsOptions = {}): Settings {
  const memory = new Map<string, string>();
  const storage = options.storage ??
    hostStorage() ?? {
      getItem: async (key: string) => memory.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        memory.set(key, value);
      },
    };
  const applyColorScheme = options.applyColorScheme ?? hostColorScheme;
  const applyDiagnosticsConsent = options.applyDiagnosticsConsent;
  const theme = signal<ThemeMode>(defaultPreferences.theme);
  const autoplayNext = signal(defaultPreferences.autoplayNext);
  const rememberPosition = signal(defaultPreferences.rememberPosition);
  const defaultRate = signal<PlaybackRate>(defaultPreferences.defaultRate);
  const quietWatching = signal(defaultPreferences.quietWatching);
  const autoCheckUpdates = signal(defaultPreferences.autoCheckUpdates);
  const diagnosticsReporting = signal(defaultPreferences.diagnosticsReporting);
  const loaded = signal(false);
  const error = signal('');
  /** Which preference the last save failure belongs to, so the row can own the message. */
  const failedKey = signal<keyof Preferences | undefined>(undefined);
  let writes = Promise.resolve();
  let revision = 0;

  const current = (): Preferences => ({
    theme: theme(),
    autoplayNext: autoplayNext(),
    rememberPosition: rememberPosition(),
    defaultRate: defaultRate(),
    quietWatching: quietWatching(),
    autoCheckUpdates: autoCheckUpdates(),
    diagnosticsReporting: diagnosticsReporting(),
  });
  const apply = (values: Preferences) => {
    theme.set(values.theme);
    autoplayNext.set(values.autoplayNext);
    rememberPosition.set(values.rememberPosition);
    defaultRate.set(values.defaultRate);
    quietWatching.set(values.quietWatching);
    autoCheckUpdates.set(values.autoCheckUpdates);
    diagnosticsReporting.set(values.diagnosticsReporting);
  };
  const readFailed = () => error().startsWith('设置未能读取');
  const persist = (key?: keyof Preferences) => {
    // After a failed read the values in memory are defaults, not what the user saved: writing
    // them back would silently replace stored preferences. The read must succeed first.
    if (!loaded() || readFailed()) return;
    const owned = ++revision;
    const raw = JSON.stringify(current());
    writes = writes.then(async () => {
      try {
        await storage.setItem(SETTINGS_STORAGE_KEY, raw);
        if (owned === revision) {
          error.set('');
          failedKey.set(undefined);
        }
      } catch {
        if (owned === revision) {
          error.set('设置未能保存，请重试');
          failedKey.set(key);
        }
      }
    });
  };
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    // Apply for this session so the control answers, but never persist over an unread store.
    apply({ ...current(), [key]: value });
    if (key === 'theme') applyColorScheme(value as ThemeMode);
    if (readFailed()) error.set('设置未能读取，本次改动未保存；请先重试读取。');
    persist(key);
  };
  /**
   * Tells the host the stored choice after a read. The host owns the reporter and starts with
   * none, so a consent saved in an earlier session has to be replayed or it silently lapses.
   */
  const replayConsent = (on: boolean) => {
    if (!applyDiagnosticsConsent) return;
    // A host that refuses is not a read failure: the app keeps showing what the user chose,
    // but nothing is reported, which is the safe side of a disagreement.
    void applyDiagnosticsConsent(on).catch(() => undefined);
  };
  const load = async () => {
    try {
      const raw = await storage.getItem(SETTINGS_STORAGE_KEY);
      loaded.set(true);
      error.set('');
      if (!raw) {
        applyColorScheme(theme());
        replayConsent(diagnosticsReporting());
        return;
      }
      const stored = readPreferences(JSON.parse(raw));
      if (!stored) {
        error.set('已保存的设置无法识别，正在使用默认设置');
        applyColorScheme(theme());
        replayConsent(diagnosticsReporting());
        return;
      }
      apply(stored);
      applyColorScheme(stored.theme);
      replayConsent(stored.diagnosticsReporting);
    } catch {
      loaded.set(true);
      error.set('设置未能读取，正在使用默认设置');
      applyColorScheme(theme());
      replayConsent(diagnosticsReporting());
    }
  };
  void load();
  // Report sites live in feature modules far from here; they read this one signal.
  bindDiagnosticsConsent(() => diagnosticsReporting());
  return {
    theme,
    autoplayNext,
    rememberPosition,
    defaultRate,
    quietWatching,
    autoCheckUpdates,
    diagnosticsReporting,
    loaded,
    error,
    failedKey,
    setTheme(value) {
      change('theme', value);
    },
    setAutoplayNext(value) {
      change('autoplayNext', value);
    },
    setRememberPosition(value) {
      change('rememberPosition', value);
    },
    setDefaultRate(value) {
      change('defaultRate', value);
    },
    setQuietWatching(value) {
      change('quietWatching', value);
    },
    setAutoCheckUpdates(value) {
      change('autoCheckUpdates', value);
    },
    async setDiagnosticsReporting(value) {
      // The host owns the reporter, so it answers first: a refusal must not look like consent.
      if (applyDiagnosticsConsent) {
        try {
          const taken = await applyDiagnosticsConsent(value);
          if (!taken) {
            failedKey.set('diagnosticsReporting');
            error.set('诊断上报未能开启，请重试');
            return false;
          }
        } catch {
          failedKey.set('diagnosticsReporting');
          error.set('诊断上报未能开启，请检查设备状态后重试');
          return false;
        }
      }
      change('diagnosticsReporting', value);
      return true;
    },
    isDefault() {
      const values = current();
      return (Object.keys(defaultPreferences) as (keyof Preferences)[]).every(
        (key) => values[key] === defaultPreferences[key],
      );
    },
    reset() {
      apply(defaultPreferences);
      applyColorScheme(defaultPreferences.theme);
      persist();
    },
    retry() {
      // A failed read must be read again, never turned into a write of the defaults: that would
      // overwrite a saved preference the user never touched. Only a failed save republishes.
      if (!loaded() || readFailed()) {
        loaded.set(false);
        revision++;
        void load();
        return;
      }
      error.set('');
      persist();
    },
    flush() {
      return writes;
    },
  };
}
