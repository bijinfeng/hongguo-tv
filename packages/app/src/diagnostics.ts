/**
 * Client diagnostics: what a failure report may contain, and how it leaves the device.
 *
 * Nothing here sends anything until the user turns reporting on. The event shape is fixed so
 * the host can aggregate on `category`, `code` and `operation`; free text is limited to the
 * failure's own message, stripped of anything that identifies the account or grants access.
 */
import * as platform from 'nsh';

/**
 * The host channel lives on the `nsh` module, which a plain Node tooling port may not carry.
 * Reading it through the module namespace keeps those imports working; a platform without it
 * reports nothing.
 */
interface HostChannel {
  available(): boolean;
  call<T>(name: string, data?: unknown): Promise<T>;
  post(name: string, data?: unknown): void;
}

const hostChannel = (): HostChannel | undefined => (platform as { host?: HostChannel }).host;

/** What failed, in terms the product keeps stable across refactors. */
export type DiagnosticCategory = 'catalog' | 'playback' | 'account' | 'storage' | 'engine' | 'ui';

/** One failure to report. `code` is the product's stable error code when the failure had one. */
export interface DiagnosticEvent {
  category: DiagnosticCategory;
  /** Stable error code such as `UPSTREAM_TIMEOUT`; absent when the failure has none. */
  code?: string;
  /** The user-facing operation that failed, in the product's own words. */
  operation: string;
  /** The failure's message, already sanitized. */
  message?: string;
  /** The failure's stack, already sanitized. */
  stack?: string;
}

/** What the host adds: the build the report came from. */
export interface DiagnosticEnvelope extends DiagnosticEvent {
  version: string;
  build: string;
  platform: string;
  session: string;
}

const MAX_MESSAGE = 512;
const MAX_STACK = 4096;

/**
 * Drops what must never leave the device: query strings and fragments of any URL (media
 * signatures live there), bearer-style tokens, and anything shaped like a phone number or an
 * email address. Returns the text unchanged when it holds none of them.
 */
export function sanitizeDiagnosticText(text: string, limit = MAX_MESSAGE): string {
  let value = text;
  // A URL keeps its host and path, which is useful; its query and fragment can carry grants.
  value = value.replace(/(https?:\/\/[^\s?#]+)[?#][^\s]*/gi, '$1');
  // A JWT is three dot-separated base64url runs; redact it before any prefix rule eats the head.
  value = value.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]');
  value = value.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]');
  value = value.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]');
  value = value.replace(/\b1[3-9]\d{9}\b/g, '[phone]');
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** The message of a thrown value, or nothing when it carried none. */
function failureMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error ? sanitizeDiagnosticText(error) : undefined;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return sanitizeDiagnosticText(message);
  }
  return undefined;
}

function failureStack(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const stack = (error as { stack?: unknown }).stack;
    if (typeof stack === 'string' && stack) return sanitizeDiagnosticText(stack, MAX_STACK);
  }
  return undefined;
}

/** The stable code a failure carries, when it carries one. */
export function failureCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  return undefined;
}

/** Builds the event from a caught failure; `operation` arrives in the product's own words. */
export function diagnosticEvent(
  category: DiagnosticCategory,
  operation: string,
  error: unknown,
): DiagnosticEvent {
  const event: DiagnosticEvent = { category, operation };
  const code = failureCode(error);
  if (code) event.code = code;
  const message = failureMessage(error);
  if (message) event.message = message;
  const stack = failureStack(error);
  if (stack) event.stack = stack;
  return event;
}

/** The host channel names; both must be granted by `capabilities.host` in nsh.json. */
const REPORT_CHANNEL = 'diagnostics.report';
const CONSENT_CHANNEL = 'diagnostics.consent';

/** Whether a present host can take reports; a port without the channel cannot. */
function available(host: HostChannel | undefined): boolean {
  if (!host) return false;
  try {
    return host.available();
  } catch {
    return false;
  }
}

/**
 * Whether the host can take reports at all. Apps without an embedding host (web, plain
 * Node tooling) get false, and every call after that is a no-op.
 */
export function diagnosticsAvailable(): boolean {
  return available(hostChannel());
}

/**
 * The one consent this build reads. `createSettings` installs its signal here, so a failure
 * site deep in a feature module can report without threading a parameter through every call.
 */
let consentSource: (() => boolean) | undefined;

/** Installs the consent the report sites read; called once by the settings owner. */
export function bindDiagnosticsConsent(source: () => boolean): void {
  consentSource = source;
}

/** Whether the user has allowed reporting; false until the settings owner binds a source. */
export function diagnosticsConsent(): boolean {
  return consentSource?.() === true;
}

/**
 * Hands one event to the host. Best effort by contract: a missing grant, a host that threw or
 * a host that answered nothing never surfaces to the caller and never reaches the UI.
 */
export function reportDiagnostic(event: DiagnosticEvent): void {
  if (!diagnosticsConsent()) return;
  const host = hostChannel();
  if (!host || !available(host)) return;
  try {
    host.post(REPORT_CHANNEL, event);
  } catch {
    // Reporting must never break the failure path it describes.
  }
}

/** Builds and hands over an event in one step, for the existing catch sites. */
export function reportFailure(
  category: DiagnosticCategory,
  operation: string,
  error: unknown,
): void {
  if (!diagnosticsConsent() || !diagnosticsAvailable()) return;
  reportDiagnostic(diagnosticEvent(category, operation, error));
}

/**
 * Tells the host to start or stop reporting. Resolves with the host's answer, which the
 * settings surface keeps: `false` means the host took no such state.
 */
export async function setDiagnosticsConsent(enabled: boolean): Promise<boolean> {
  const host = hostChannel();
  if (!available(host)) return false;
  const answer = await host!.call<unknown>(CONSENT_CHANNEL, enabled);
  return answer !== false;
}
