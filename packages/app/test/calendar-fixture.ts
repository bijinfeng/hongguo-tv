import type { StubRequest, StubResponse } from 'nsh/test';
import type { CalendarItem, Drama } from '@hongguo/core-client';

const ok = (data: unknown): StubResponse => ({ body: { ok: true, data } });
const bad = (error: string, status = 400): StubResponse => ({ status, body: { ok: false, error } });
const schema = {
  current_date: '20261114',
  default_date: '20261114',
  dates: ['20261114', '20261115'],
};

/** Fixed, read-only calendar/new-series responses. Shared by NSH stubs and the HTTP harness. */
export function calendarFixture(
  options: {
    terminalDelayMs?: number;
    coverOrigin?: string;
    longLists?: boolean;
    longAnnouncement?: boolean;
    emptyTomorrow?: boolean;
  } = {},
) {
  const reads: string[] = [];
  const writes: string[] = [];
  const unknown: string[] = [];
  let terminalReads = 0;
  let failedMore = false;
  const summary = (id: string): Drama => ({
    series_id: id,
    title:
      id === '101'
        ? '春山不负'
        : id === '111'
          ? '明日春山'
          : id === '201'
            ? '重返 1998'
            : `日历故事 ${id}`,
    cover: options.coverOrigin ? `${options.coverOrigin}/calendar-cover/${Number(id) % 4}` : '',
    intro: '用于验收的合成故事，不连接真实预约或账号。',
    episode_count: 2,
  });
  const released = (id: string): CalendarItem => ({
    entry: { kind: 'released', drama: summary(id) },
    tags: [],
    publish_text: '已上线',
  });
  const upcoming = (id: string): CalendarItem => ({
    entry: {
      kind: 'upcoming',
      title: options.longAnnouncement
        ? '重返故乡之后与春山重逢的漫长故事'.repeat(4)
        : id === '301'
          ? '明日预告'
          : `待上线 ${id}`,
      cover: options.coverOrigin ? `${options.coverOrigin}/calendar-cover/2` : '',
      intro: options.longAnnouncement
        ? '春山与故乡的故事，等待下一次相逢。'.repeat(200)
        : '这是一条未上线公告，不能播放或预约。',
    },
    reservation_id: id,
    tags: [],
    publish_text: '11月15日 18:00 上线',
  });
  const terminal = () =>
    ok({
      items: [released('102')],
      has_more: false,
      next_offset: 60,
      next_subscribe_offset: 23,
      session_id: 'calendar-14',
      calendar: schema,
    });
  const handle = (request: StubRequest): StubResponse => {
    const url = new URL(request.url, 'http://calendar-fixture.local');
    const path = url.pathname + url.search;
    if (request.method !== 'GET') {
      writes.push(`${request.method} ${path}`);
      return bad('Calendar acceptance permits GET only', 405);
    }
    reads.push(path);
    if (request.body) return bad('GET request bodies are not accepted');
    if (url.pathname === '/api/v1/library')
      return ok({ owner_id: 'calendar-fixture', entries: [] });
    if (url.pathname === '/api/v1/account')
      return ok({ logged_in: false, qr_login_available: false });
    if (url.pathname === '/api/v1/search/history' || url.pathname === '/api/v1/search/suggestions')
      return ok({ items: [] });
    if (url.pathname === '/api/v1/search/discovery') return ok({ guesses: [], boards: [] });
    if (url.pathname === '/api/v1/lists/recommend')
      return ok({
        channel: url.searchParams.get('channel'),
        items: [summary('101')],
        has_more: false,
        next_offset: 10,
        feed_cell: '123',
        feed_plan: '456',
        session_id: 'home-fixture',
      });
    if (url.pathname === '/api/v1/series/detail') {
      const id = url.searchParams.get('series_id')!;
      if (
        !['101', '102', '111', '201', '202', '211'].includes(id) &&
        !(options.longLists && /^[567]\d\d$/.test(id))
      )
        return bad('An announcement is not a playable drama', 404);
      return ok({
        ...summary(id),
        episodes: [1, 2].map((index) => ({ index, video_id: `${id}${index}`, locked: false })),
      });
    }
    if (url.pathname === '/api/v1/lists/calendar') {
      const date = url.searchParams.get('date') ?? '20261114';
      if (!schema.dates.includes(date)) return bad('Unexpected calendar date');
      const offset = url.searchParams.get('offset');
      if (offset === null) {
        if (url.searchParams.has('subscribe_offset') || url.searchParams.has('session_id'))
          return bad('First calendar page must omit continuation');
        return ok({
          items:
            options.emptyTomorrow && date === '20261115'
              ? []
              : options.longLists
                ? [
                    ...(date === '20261114'
                      ? [released('101'), upcoming('301')]
                      : [released('111'), upcoming('311')]),
                    ...Array.from({ length: 52 }, (_, i) =>
                      released(String((date === '20261114' ? 500 : 600) + i)),
                    ),
                  ]
                : date === '20261114'
                  ? [released('101'), upcoming('301')]
                  : [released('111'), upcoming('311')],
          has_more: date === '20261114',
          next_offset: 45,
          session_id: date === '20261114' ? 'calendar-14' : 'calendar-15',
          calendar: schema,
        });
      }
      if (date !== '20261114' || url.searchParams.get('session_id') !== 'calendar-14')
        return bad('Unexpected calendar continuation owner');
      if (offset === '45' && !url.searchParams.has('subscribe_offset')) {
        if (!failedMore) {
          failedMore = true;
          return bad('日历续页合成离线', 503);
        }
        return ok({
          items: [upcoming('302')],
          has_more: true,
          next_offset: 24,
          next_subscribe_offset: 23,
          session_id: 'calendar-14',
          calendar: schema,
        });
      }
      if (offset === '24' && url.searchParams.get('subscribe_offset') === '23')
        return ok({
          items: [],
          has_more: true,
          next_offset: 60,
          next_subscribe_offset: 23,
          session_id: 'calendar-14',
          calendar: schema,
        });
      if (offset === '60' && url.searchParams.get('subscribe_offset') === '23') {
        terminalReads += 1;
        return { ...terminal(), delay: options.terminalDelayMs ?? 0 };
      }
      return bad('Unexpected independent calendar cursors');
    }
    if (url.pathname === '/api/v1/lists/new') {
      const gender = url.searchParams.get('gender');
      if (!['0', '1', '2'].includes(gender ?? '')) return bad('Unexpected new-series audience');
      const offset = url.searchParams.get('offset');
      if (offset === null)
        return ok({
          items: options.longLists
            ? Array.from({ length: 52 }, (_, i) => summary(String(700 + i)))
            : [summary(gender === '1' ? '211' : '201')],
          has_more: gender === '2',
          next_offset: 12,
          session_id: `new-${gender}`,
        });
      if (offset === '12' && url.searchParams.get('session_id') === `new-${gender}`)
        return ok({
          items: [summary('202')],
          has_more: false,
          next_offset: 24,
          session_id: `new-${gender}`,
        });
      return bad('Unexpected new-series continuation');
    }
    unknown.push(path);
    return bad('Unknown read-only calendar fixture route', 404);
  };
  return {
    reads,
    writes,
    unknown,
    handle,
    terminalReads: () => terminalReads,
  };
}
