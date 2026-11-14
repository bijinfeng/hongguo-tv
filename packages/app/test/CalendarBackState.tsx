import { cleanup, signal, View } from 'nsh';
import { Button, UiText } from '@hongguo/ui';
import { configureTransport } from '@hongguo/core-client';
import { createStore } from '../src/store';

/** Small store fixture: the page owns local disclosure, the store owns route/back priority. */
export function CalendarBackStateFixture() {
  configureTransport({
    mediaOrigin: 'http://127.0.0.1:18765',
    async request(path, _signal, body) {
      if (body !== undefined) throw new Error('Calendar back acceptance cannot write');
      if (path === '/api/v1/library') return { owner_id: 'calendar-back', entries: [] };
      if (path === '/api/v1/account') return { logged_in: false };
      if (path === '/api/v1/lists/calendar')
        return {
          items: [],
          has_more: false,
          next_offset: 0,
          session_id: 'calendar-back',
          calendar: { dates: ['20261114'], default_date: '20261114', current_date: '20261114' },
        };
      throw new Error(`Unexpected calendar back read: ${path}`);
    },
  });
  const store = createStore('tv');
  const announcement = signal(true);
  const calls = signal(0);
  const closed = signal(0);
  const nativeConsumed = signal('none');
  const dismiss = () => {
    calls.set(calls() + 1);
    if (!announcement()) return false;
    announcement.set(false);
    closed.set(closed() + 1);
    return true;
  };
  let unregister = store.registerCalendarBack(dismiss);
  cleanup(() => unregister());
  return (
    <View class="flex-1 bg-background p-6 gap-3">
      <View class="flex-row flex-wrap gap-2">
        <Button label="进入日历" onPress={() => store.navigate('calendar')} />
        <Button label="展开公告" onPress={() => announcement.set(true)} />
        <Button label="返回" onPress={store.back} />
        <Button
          label="原生返回层"
          onPress={() => nativeConsumed.set(String(store.handleCalendarBack()))}
        />
        <Button
          label="打开详情"
          onPress={() => store.open({ series_id: '101', title: '合成短剧', cover: '', intro: '' })}
        />
        <Button
          label="替换并注销旧处理器"
          onPress={() => {
            const stale = unregister;
            unregister = store.registerCalendarBack(() => dismiss());
            stale();
          }}
        />
        <Button label="注销返回处理器" onPress={() => unregister()} />
      </View>
      <UiText>{`section:${store.section()}`}</UiText>
      <UiText>{`depth:${store.nav.routes().length}`}</UiText>
      <UiText>{`announcement:${announcement() ? 'open' : 'closed'}`}</UiText>
      <UiText>{`calls:${calls()} · closed:${closed()}`}</UiText>
      <UiText>{`native-consumed:${nativeConsumed()}`}</UiText>
    </View>
  );
}
