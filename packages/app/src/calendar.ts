import { batch, cleanup, effect, lifecycle, signal } from 'nsh';
import { unixStampLabel } from './format';
import type {
  captureRequest,
  CalendarItem,
  CalendarResult,
  CalendarSchema,
  NewSeriesResult,
} from '@hongguo/core-client';

export type CalendarMode = 'calendar' | 'new';
export type CalendarPage = Omit<CalendarResult, 'calendar'>;
export type ReleaseCalendar = ReturnType<typeof createCalendar>;

/** Exact typed row identity: announcement item IDs are never playable drama IDs. */
export function calendarItemId(item: CalendarItem): string {
  return item.entry.kind === 'released'
    ? `released-${item.entry.drama.series_id}`
    : `upcoming-${item.reservation_id ?? ''}`;
}
export function validCalendarDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6));
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month > 0 && month <= 12 && day > 0 && day <= days[month - 1];
}
export function calendarDateLabel(value: string, today?: string): string {
  return `${value === today ? '今天 · ' : ''}${Number(value.slice(4, 6))}月${Number(value.slice(6))}日`;
}
/** Public release labels use upstream copy, or its exact timestamp in the source's China timezone. */
export function calendarPublishLabel(item: CalendarItem): string {
  if (item.publish_text) return item.publish_text;
  if (!item.publish_time) return '上线时间待公布';
  return `${unixStampLabel(item.publish_time)} 上线`;
}
const validOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100000;
const validId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value);
function validItem(item: CalendarItem): boolean {
  if (!item || !Array.isArray(item.tags)) return false;
  const entry = item.entry;
  if (entry?.kind === 'released') return validId(entry.drama?.series_id);
  return (
    entry?.kind === 'upcoming' && validId(item.reservation_id) && typeof entry.title === 'string'
  );
}
function validSchema(value: CalendarSchema): boolean {
  return (
    Array.isArray(value.dates) &&
    value.dates.length <= 366 &&
    value.dates.every(validCalendarDate) &&
    validCalendarDate(value.current_date) &&
    validCalendarDate(value.default_date)
  );
}

/** Page-owned independent release snapshots; hidden/background owners keep only completed work. */
export function createCalendar(request: ReturnType<typeof captureRequest>, active: () => boolean) {
  const mode = signal<CalendarMode>('calendar');
  const date = signal('');
  const gender = signal('2');
  const schema = signal<CalendarSchema | undefined>(undefined);
  const defaultDate = signal('');
  const pages = signal<Record<string, CalendarPage>>({});
  const loading = signal(false);
  const error = signal('');
  const selected = signal('');
  const key = () => (mode() === 'calendar' ? `calendar:${date()}` : `new:${gender()}`);
  const data = () => pages()[key()];
  const effectiveDate = () => date() || defaultDate();
  const enabled = () => active() && lifecycle() !== 'background' && !disposed;
  let revision = 0;
  let disposed = false;
  let abort: AbortController | undefined;
  const cancel = () => {
    revision++;
    abort?.abort();
    abort = undefined;
    loading.set(false);
  };
  const read = async (more = false) => {
    if (!enabled() || loading() || (more && !data()?.has_more)) return;
    const identity = key();
    const currentMode = mode();
    const prior = more ? data() : undefined;
    const offset = prior?.next_offset ?? 0;
    const subscribe = prior?.next_subscribe_offset;
    if (!validOffset(offset) || (subscribe !== undefined && !validOffset(subscribe))) {
      error.set('分页数据无效，请重新选择日期。');
      return;
    }
    const controller = new AbortController();
    abort = controller;
    const owner = ++revision;
    const owns = () =>
      enabled() && owner === revision && identity === key() && !controller.signal.aborted;
    const params = new URLSearchParams();
    if (currentMode === 'calendar') {
      // Freeze the accepted day across midnight; only the initial default request omits it.
      const requestedDate = date() || (prior ? defaultDate() : '');
      if (requestedDate) params.set('date', requestedDate);
      // Explicit zero skips the released phase: do not add this cursor on a first request.
      if (prior && subscribe !== undefined) params.set('subscribe_offset', String(subscribe));
    } else params.set('gender', gender());
    if (prior) {
      params.set('offset', String(offset));
      params.set('session_id', prior.session_id);
    }
    const path = `/api/v1/lists/${currentMode === 'calendar' ? 'calendar' : 'new'}${params.toString() ? `?${params}` : ''}`;
    batch(() => {
      loading.set(true);
      error.set('');
    });
    try {
      let next: CalendarResult;
      if (currentMode === 'calendar') next = await request<CalendarResult>(path, controller.signal);
      else {
        const result = await request<NewSeriesResult>(path, controller.signal);
        if (!Array.isArray(result?.items)) throw new Error('新剧数据无效，请重试。');
        next = {
          ...result,
          items: result.items.map((drama) => ({ entry: { kind: 'released', drama }, tags: [] })),
        };
      }
      if (!owns()) return;
      if (currentMode === 'calendar' && !date() && !defaultDate() && !next.calendar)
        throw new Error('上新日期未能确认，请重试。');
      if (
        !Array.isArray(next?.items) ||
        !next.items.every(validItem) ||
        typeof next.has_more !== 'boolean' ||
        typeof next.session_id !== 'string' ||
        next.session_id.length > 1024 ||
        Array.from(next.session_id).some((character) => {
          const code = character.charCodeAt(0);
          return code < 32 || code === 127;
        }) ||
        !validOffset(next.next_offset) ||
        (next.next_subscribe_offset !== undefined && !validOffset(next.next_subscribe_offset)) ||
        (next.calendar !== undefined && !validSchema(next.calendar))
      )
        throw new Error('上新数据无效，请重试。');
      const nextSubscribe =
        currentMode === 'calendar' ? (next.next_subscribe_offset ?? subscribe) : undefined;
      const advances =
        next.next_offset > offset ||
        (currentMode === 'calendar' &&
          nextSubscribe !== undefined &&
          (subscribe === undefined || nextSubscribe > subscribe));
      if (next.has_more && !advances) throw new Error('分页数据没有更新，请重试。');
      const seen = new Set(prior?.items.map(calendarItemId));
      const added = next.items.filter((item) => {
        const id = calendarItemId(item);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      batch(() => {
        if (next.calendar) {
          if (!defaultDate()) defaultDate.set(next.calendar.default_date);
          schema.set({ ...next.calendar, dates: [...new Set(next.calendar.dates)] });
        }
        pages.set({
          ...pages(),
          [identity]: {
            items: [...(prior?.items ?? []), ...added],
            has_more: next.has_more,
            next_offset: next.next_offset,
            next_subscribe_offset: nextSubscribe,
            session_id: next.session_id,
          },
        });
      });
    } catch {
      if (owns()) error.set('上新内容加载失败，请重试。');
    } finally {
      if (owns()) {
        abort = undefined;
        loading.set(false);
      }
    }
  };
  effect(() => {
    if (!enabled()) {
      cancel();
      return;
    }
    if (!data() && !loading() && !error()) void read();
  });
  cleanup(() => {
    disposed = true;
    cancel();
  });
  const change = (apply: () => void) =>
    batch(() => {
      cancel();
      apply();
      selected.set('');
      error.set('');
    });
  return {
    mode,
    date,
    gender,
    schema,
    data,
    loading,
    error,
    selected,
    key,
    effectiveDate,
    setMode(value: CalendarMode) {
      if ((value === 'calendar' || value === 'new') && value !== mode())
        change(() => mode.set(value));
    },
    setDate(value: string) {
      if (validCalendarDate(value) && schema()?.dates.includes(value) && value !== effectiveDate())
        change(() => date.set(value === defaultDate() ? '' : value));
    },
    setGender(value: string) {
      if (['0', '1', '2'].includes(value) && value !== gender()) change(() => gender.set(value));
    },
    retry() {
      void read(!!data());
    },
    loadMore() {
      void read(true);
    },
  };
}
