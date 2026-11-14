import { cleanup, signal, Text, View } from 'nsh';
import { Button } from '@hongguo/ui';
import type { CalendarItem, CalendarResult, NewSeriesResult } from '@hongguo/core-client';
import { calendarItemId, createCalendar, validCalendarDate } from '../src/calendar';

const released = (id: string): CalendarItem => ({
  entry: { kind: 'released', drama: { series_id: id, title: `短剧${id}`, cover: '', intro: '' } },
  tags: [],
});
const upcoming = (id: string): CalendarItem => ({
  entry: { kind: 'upcoming', title: `预告${id}`, cover: '', intro: '未上线公告' },
  reservation_id: id,
  tags: [],
});
const schema = {
  dates: ['20261114', '20261115'],
  default_date: '20261114',
  current_date: '20261114',
};

/** Deferred fake deliberately ignores abort, proving controller ownership beyond transport cooperation. */
export function CalendarStateFixture() {
  const active = signal(false);
  const shown = signal(true);
  const events = signal<string[]>([]);
  const log = (value: string) => events.update((all) => [...all, value]);
  const pending = new Map<
    number,
    { path: string; resolve: (value: unknown) => void; reject: () => void }
  >();
  let number = 0;
  let calendar: ReturnType<typeof createCalendar> | undefined;
  function Owner() {
    const owned = createCalendar(async <T,>(path: string, abort?: AbortSignal, body?: unknown) => {
      if (body !== undefined) throw new Error('Calendar cannot write');
      const id = ++number;
      log(`read${id}:${path}`);
      abort?.addEventListener('abort', () => log(`abort${id}`));
      return new Promise<unknown>((resolve, reject) =>
        pending.set(id, { path, resolve, reject: () => reject(new Error('合成失败')) }),
      ) as Promise<T>;
    }, active);
    calendar = owned;
    cleanup(() => {
      calendar = undefined;
    });
    return (
      <View testID="calendar-owner">
        <Text>{`ids:${owned.data()?.items.map(calendarItemId).join(',') ?? 'none'}`}</Text>
        <Text>{`selection:${owned.key()}`}</Text>
        <Text>{`dates:${owned.schema()?.dates.join(',') ?? ''}`}</Text>
        <Text>{`effective:${owned.effectiveDate()}`}</Text>
        <Text>{`loading:${owned.loading()}`}</Text>
        <Text>{owned.error() ? 'calendar-error' : 'no-error'}</Text>
        <Text>{`cursor:${owned.data()?.next_offset ?? '-'}:${owned.data()?.next_subscribe_offset ?? '-'}`}</Text>
      </View>
    );
  }
  const complete = (
    id: number,
    type:
      | 'first'
      | 'transition'
      | 'empty'
      | 'stalled'
      | 'terminal'
      | 'bad-schema'
      | 'no-schema'
      | 'midnight' = 'first',
  ) => {
    const read = pending.get(id);
    if (!read) return;
    const result: CalendarResult = {
      items:
        type === 'empty'
          ? []
          : type === 'transition'
            ? [upcoming('1'), upcoming('3')]
            : [released('1'), released('2'), released('2'), upcoming('1')],
      has_more: type !== 'terminal',
      next_offset:
        type === 'stalled'
          ? 0
          : type === 'transition'
            ? 24
            : type === 'empty' || type === 'midnight'
              ? 60
              : 45,
      ...(type === 'transition' ? { next_subscribe_offset: 23 } : {}),
      session_id: 'fixture-session',
      calendar:
        type === 'no-schema'
          ? undefined
          : type === 'bad-schema'
            ? { ...schema, dates: ['20260229'] }
            : type === 'midnight'
              ? { ...schema, current_date: '20261115', default_date: '20261115' }
              : schema,
    };
    const isNew = read.path.includes('/new?');
    const next: CalendarResult | NewSeriesResult = isNew
      ? {
          items: [released('10'), released('10')].map((item) =>
            item.entry.kind === 'released' ? item.entry.drama : neverDrama(),
          ),
          has_more: true,
          next_offset: 20,
          session_id: 'new-session',
        }
      : result;
    read.resolve(next);
    pending.delete(id);
  };
  return (
    <View class="flex-1 bg-background">
      <View class="flex-row flex-wrap">
        <Button label="激活日历" onPress={() => active.set(true)} />
        <Button label="隐藏日历" onPress={() => active.set(false)} />
        <Button label="日历模式" onPress={() => calendar?.setMode('calendar')} />
        <Button label="新剧模式" onPress={() => calendar?.setMode('new')} />
        <Button label="选择明天" onPress={() => calendar?.setDate('20261115')} />
        <Button label="选择今天" onPress={() => calendar?.setDate('20261114')} />
        <Button label="拒绝虚构日期" onPress={() => calendar?.setDate('20261116')} />
        <Button label="选择男生" onPress={() => calendar?.setGender('1')} />
        <Button label="完成首屏" onPress={() => complete(1)} />
        <Button label="完成当前" onPress={() => complete(number)} />
        <Button label="完成旧续页" onPress={() => complete(2)} />
        <Button label="完成阶段切换" onPress={() => complete(number, 'transition')} />
        <Button label="完成空页" onPress={() => complete(number, 'empty')} />
        <Button label="完成跨日页" onPress={() => complete(number, 'midnight')} />
        <Button label="完成坏游标" onPress={() => complete(number, 'stalled')} />
        <Button label="完成坏日期" onPress={() => complete(number, 'bad-schema')} />
        <Button label="完成无日期" onPress={() => complete(number, 'no-schema')} />
        <Button label="完成末页" onPress={() => complete(number, 'terminal')} />
        <Button label="失败当前" onPress={() => pending.get(number)?.reject()} />
        <Button
          label="追加日历"
          onPress={() => {
            calendar?.loadMore();
            calendar?.loadMore();
          }}
        />
        <Button label="重试日历" onPress={() => calendar?.retry()} />
        <Button label="移除日历" onPress={() => shown.set(false)} />
        <Button
          label="验证真实日期"
          onPress={() =>
            log(
              validCalendarDate('20240229') &&
                !validCalendarDate('19000229') &&
                !validCalendarDate('20260431')
                ? 'dates-valid'
                : 'dates-invalid',
            )
          }
        />
      </View>
      <Text class="line-clamp-4">{events().join('|')}</Text>
      <If when={shown()}>
        <Owner />
      </If>
    </View>
  );
}
function neverDrama(): never {
  throw new Error('Only released fixture rows are dramas');
}
