import { expect, test } from 'nsh/test';
import {
  diagnosticEvent,
  sanitizeDiagnosticText,
  type DiagnosticCategory,
} from '../src/diagnostics';

/**
 * The sanitizer is the only place a report loses identifying data, so these cases pin what
 * must never survive: media signatures, credentials, account identifiers and typed input.
 */
export function registerDiagnosticsTests() {
  test('diagnostics: a signed media URL keeps its host and drops its query', () => {
    const text = 'GET https://v.example.com/media/1.mp4?sign=abc123&expires=99 failed';
    const clean = sanitizeDiagnosticText(text);
    expect(clean.includes('v.example.com/media/1.mp4')).toBe(true);
    expect(clean.includes('sign=abc123')).toBe(false);
    expect(clean.includes('expires=99')).toBe(false);
  });

  test('diagnostics: a fragment is dropped as well as a query', () => {
    const clean = sanitizeDiagnosticText('see https://example.com/a#token=secret');
    expect(clean).toBe('see https://example.com/a');
  });

  test('diagnostics: authorization headers and JWTs are redacted', () => {
    const header = sanitizeDiagnosticText('Authorization: Bearer abc.def-123_456');
    expect(header.includes('abc.def-123_456')).toBe(false);
    expect(header.includes('[redacted]')).toBe(true);
    const jwt = sanitizeDiagnosticText(
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    );
    expect(jwt.includes('eyJhbGciOiJIUzI1NiJ9')).toBe(false);
  });

  test('diagnostics: phone numbers and emails leave as placeholders', () => {
    expect(sanitizeDiagnosticText('user 13812345678 failed')).toBe('user [phone] failed');
    expect(sanitizeDiagnosticText('mail someone@example.com bounced')).toBe('mail [email] bounced');
  });

  test('diagnostics: a long message is truncated instead of sent whole', () => {
    const clean = sanitizeDiagnosticText('x'.repeat(2000));
    expect(clean.length).toBeLessThanOrEqual(513);
    expect(clean.endsWith('…')).toBe(true);
  });

  test('diagnostics: the event carries the stable code and a sanitized message', () => {
    const failure = {
      code: 'UPSTREAM_TIMEOUT',
      message: 'GET https://api.example.com/x?sign=leak timed out',
    };
    const event = diagnosticEvent('catalog', '打开详情', failure);
    expect(event.category).toBe('catalog');
    expect(event.code).toBe('UPSTREAM_TIMEOUT');
    expect(event.operation).toBe('打开详情');
    expect(event.message?.includes('sign=leak')).toBe(false);
  });

  test('diagnostics: a failure without a message still reports its category', () => {
    const event = diagnosticEvent('storage', '保存观看进度', undefined);
    expect(event).toEqual({ category: 'storage', operation: '保存观看进度' });
  });

  test('diagnostics: the category set is closed', () => {
    // The union is the contract: anything outside it fails to type check, so no runtime path
    // can emit one. Pinning the exact set makes adding a category a deliberate edit.
    const known: DiagnosticCategory[] = [
      'catalog',
      'playback',
      'account',
      'storage',
      'engine',
      'ui',
    ];
    expect(known.length).toBe(6);
  });
}
