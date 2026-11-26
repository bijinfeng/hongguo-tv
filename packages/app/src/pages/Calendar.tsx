import {
  List,
  Scroll,
  View,
  signal,
  effect,
  cleanup,
  fontScale,
  lifecycle,
  platform,
  keymap,
  type ListRef,
  type ScrollRef,
  type ViewRef,
} from 'nsh';
import {
  Button,
  CardControls,
  ContentArrival,
  Cover,
  DateChoice,
  ExpandableText,
  FilterChoices,
  Notice,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  PosterCard,
  type ProductTarget,
} from '@hongguo/ui';
import type { CalendarItem, Drama } from '@hongguo/core-client';
import {
  calendarDateLabel,
  calendarItemId,
  calendarPublishLabel,
  type ReleaseCalendar,
} from '../calendar';
import { ReservationAction, ReservationNotice, type ReservationStore } from '../ReservationAction';
import { tvColumns } from '../shell/tv-layout';
import { desktopContentFrame } from '../shell/ContentColumn';
import { collectionTargetVisible } from '../collection-visibility';

/** Approved shared release browsing. The parent owns navigation and the controller lifetime. */
export function Calendar(props: {
  calendar: ReleaseCalendar;
  target: ProductTarget;
  active: boolean;
  onOpen: (drama: Drama, restore: () => void) => void;
  onSource: (restore: () => void) => void;
  onNavigate: () => void;
  focusGuard: () => () => boolean;
  onPrimary?: (ref: ViewRef) => void;
  onRegisterBack: (handler: () => boolean) => () => void;
  reservation?: ReservationStore;
}) {
  const calendar = props.calendar;
  const width = signal(0);
  const height = signal(0);
  const dateContentHeight = signal(0);
  const announcementFocused = signal(false);
  const refs = new Map<string, ViewRef>();
  const dateRefs = new Map<string, ViewRef>();
  const anchors = new Map<string, { id: string; offset: number }>();
  let list: ListRef | undefined;
  let primary: ViewRef | undefined;
  let newMode: ViewRef | undefined;
  let more: ViewRef | undefined;
  let closeAnnouncement: ViewRef | undefined;
  let announcementScroll: ScrollRef | undefined;
  let announcementOffset = 0;
  let announcementViewport = 0;
  let announcementFrame = 0;
  let frame = 0;
  let cardFrame = 0;
  let cardIntent:
    | { key: string; id: string; owns: () => boolean; restorePosition: boolean; checked: boolean }
    | undefined;
  let moreFrame = 0;
  let moreIntent: { key: string; owns: () => boolean } | undefined;
  let disposed = false;
  let positionRevision = 0;
  let previous = calendar.key();
  const columns = () => (props.target === 'tv' ? tvColumns('collection', width() - 12) : 4);
  const cardWidth = () => Math.max(1, (width() - 12 - 16 * (columns() - 1)) / columns());
  const items = () => calendar.data()?.items ?? [];
  const restorePosition = (key: string, source?: string) => {
    if (disposed || !props.active || key !== calendar.key()) return;
    const anchor = anchors.get(key);
    const index = items().findIndex((item) => calendarItemId(item) === (source ?? anchor?.id));
    if (index >= 0)
      list?.scrollToIndex({
        index: Math.floor(index / columns()),
        viewPosition: source ? 0.5 : 0,
        viewOffset: source ? 0 : -(anchor?.offset ?? 0),
        animated: false,
      });
  };
  const focusPrimary = () => {
    if (props.active && !disposed) primary?.focus();
  };
  const focusNew = () => {
    if (props.active && !disposed) newMode?.focus();
  };
  const restoreCard = () => {
    cancelAnimationFrame(cardFrame);
    cardFrame = requestAnimationFrame(() => {
      const intent = cardIntent;
      if (!intent) return;
      if (disposed || !props.active || intent.key !== calendar.key() || !intent.owns()) {
        cardIntent = undefined;
        return;
      }
      if (intent.restorePosition) {
        intent.restorePosition = false;
        restorePosition(intent.key);
        restoreCard();
        return;
      }
      const ref = refs.get(intent.id);
      if (!ref) {
        restorePosition(intent.key, intent.id);
        return;
      }
      void Promise.all([ref.measure(), list?.measure()]).then(([card, viewport]) => {
        if (cardIntent !== intent || disposed || !props.active || !intent.owns()) return;
        if (
          !card ||
          !viewport ||
          !collectionTargetVisible(
            card.pagePosition.y,
            card.bounds.size.height,
            viewport.pagePosition.y,
            viewport.bounds.size.height,
            8,
          )
        ) {
          if (!intent.checked) {
            intent.checked = true;
            restorePosition(intent.key, intent.id);
            restoreCard();
          }
          // Retry once, then wait for layout/ref changes without focusing unsettled bounds.
          return;
        }
        ref.focus();
      });
    });
  };
  const source = (id: string) => {
    const key = calendar.key();
    return () => {
      if (!props.active || disposed || key !== calendar.key()) return;
      cardIntent = { key, id, owns: props.focusGuard(), restorePosition: true, checked: false };
      restoreCard();
    };
  };
  const moreSource = () =>
    props.onSource(() => {
      if (!props.active || disposed) return;
      if (calendar.data()?.has_more) more?.focus();
      else focusPrimary();
    });
  effect(() => {
    const key = calendar.key();
    positionRevision++;
    if (key !== previous) {
      previous = key;
      cardIntent = undefined;
      if (!anchors.has(key)) list?.scrollToOffset({ offset: 0, animated: false });
    }
    if (!props.active) {
      cardIntent = undefined;
      return;
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => restorePosition(key));
  });
  effect(() => {
    if (calendar.loading()) return;
    const intent = moreIntent;
    moreIntent = undefined;
    if (!intent) return;
    cancelAnimationFrame(moreFrame);
    moreFrame = requestAnimationFrame(() => {
      if (disposed || !props.active || intent.key !== calendar.key() || !intent.owns()) return;
      if (calendar.data()?.has_more) more?.focus();
      else focusPrimary();
    });
  });
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(cardFrame);
    cancelAnimationFrame(moreFrame);
    cancelAnimationFrame(announcementFrame);
  });
  const announcement = () =>
    items().find(
      (item) => calendarItemId(item) === calendar.selected() && item.entry.kind === 'upcoming',
    );
  const dismissAnnouncement = () => {
    if (!announcement()) return false;
    const restore = source(calendar.selected());
    props.onNavigate();
    calendar.selected.set('');
    restore();
    return true;
  };
  cleanup(props.onRegisterBack(dismissAnnouncement));
  effect(() => {
    if (!props.active || !announcement() || !announcementFocused()) return;
    const scroll = (direction: number) => {
      announcementScroll?.scrollTo({
        y: Math.max(0, announcementOffset + direction * announcementViewport * 0.8),
        animated: false,
      });
    };
    cleanup(
      keymap.bind(
        {
          down: () => scroll(1),
          up: () => scroll(-1),
          pagedown: () => scroll(1),
          pageup: () => scroll(-1),
          home: () => announcementScroll?.scrollTo({ y: 0, animated: false }),
          end: () => announcementScroll?.scrollToEnd({ animated: false }),
        },
        { when: 'notEditing', repeat: true },
      ),
    );
  });
  const title = (item: CalendarItem) =>
    item.entry.kind === 'released' ? item.entry.drama.title : item.entry.title;
  const cover = (item: CalendarItem) =>
    item.entry.kind === 'released'
      ? item.entry.drama.cover_fallback || item.entry.drama.cover
      : item.entry.cover_fallback || item.entry.cover;
  const intro = (item: CalendarItem) => (item.entry.kind === 'upcoming' ? item.entry.intro : '');
  const dayLabel = (value: string) => {
    if (value === calendar.schema()?.current_date) return '今天';
    const day = new Date(
      `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}T00:00:00Z`,
    ).getUTCDay();
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day];
  };
  const caption = (item: CalendarItem) =>
    item.entry.kind === 'upcoming'
      ? `${calendarPublishLabel(item)} · 查看安排`
      : item.publish_text ||
        (item.entry.drama.episode_count ? `${item.entry.drama.episode_count} 集` : '已上线');
  return (
    <View
      testID="release-calendar"
      class="flex-1"
      style={
        props.target === 'tv'
          ? { paddingTop: 16, gap: 12 }
          : desktopContentFrame({ top: 24, gap: 24 })
      }
    >
      {/* One name for one destination: the rail and crumb say 上新日历, so this page does too. */}
      <View
        class={
          props.target === 'tv' ? 'flex-row flex-wrap items-center justify-between gap-3' : 'gap-6'
        }
      >
        <UiText role="page">上新日历</UiText>
        <CardControls label="上新日历视图" onNavigate={props.onNavigate} class="gap-3">
          <Button
            label="上新日历"
            testID="calendar-mode-calendar"
            selected={calendar.mode() === 'calendar'}
            buttonRef={(ref) => {
              primary = ref;
              props.onPrimary?.(ref);
            }}
            onFocus={() => props.onSource(focusPrimary)}
            onPress={() => {
              props.onNavigate();
              primary?.focus();
              calendar.setMode('calendar');
              props.onSource(focusPrimary);
            }}
          />
          <Button
            label="新剧"
            testID="calendar-mode-new"
            selected={calendar.mode() === 'new'}
            buttonRef={(ref) => {
              newMode = ref;
            }}
            onFocus={() => props.onSource(focusNew)}
            onPress={() => {
              props.onNavigate();
              newMode?.focus();
              calendar.setMode('new');
              props.onSource(focusNew);
            }}
          />
        </CardControls>
      </View>
      <If
        when={calendar.mode() === 'calendar'}
        else={
          <FilterChoices
            variant={props.target === 'tv' ? 'select' : 'chips'}
            label="人群"
            testID="calendar-gender"
            active={props.active}
            value={calendar.gender()}
            items={[
              { value: '0', title: '全部' },
              { value: '1', title: '男生' },
              { value: '2', title: '女生' },
            ]}
            onNavigate={props.onNavigate}
            onSource={props.onSource}
            onChange={(value) => {
              props.onNavigate();
              calendar.setGender(value);
            }}
          />
        }
      >
        <If when={calendar.schema()?.dates.length}>
          <Scroll
            horizontal
            testID="calendar-dates"
            style={{
              height: Math.max(
                (props.target === 'tv' ? 36 : 112) * fontScale(),
                dateContentHeight() + (props.target === 'tv' ? 8 : 16),
              ),
              flexShrink: 0,
            }}
            contentStyle={{
              minWidth: '100%',
              padding: props.target === 'tv' ? 4 : 8,
            }}
          >
            <View
              class="w-full"
              onLayout={({ bounds }) => dateContentHeight.set(bounds.size.height)}
            >
              <CardControls
                label="上新日期"
                onNavigate={props.onNavigate}
                class="gap-3 flex-nowrap w-full"
              >
                <Each
                  of={Array.from(
                    { length: calendar.schema()?.dates.length ?? 0 },
                    (_, index) => index,
                  )}
                >
                  {(slot) => {
                    let ref: ViewRef | undefined;
                    const value = () => calendar.schema()!.dates[slot()];
                    effect(() => {
                      const id = value();
                      if (ref) dateRefs.set(id, ref);
                      cleanup(() => {
                        if (dateRefs.get(id) === ref) dateRefs.delete(id);
                      });
                    });
                    const restoreDate = () => {
                      const id = value();
                      return () => {
                        if (props.active && calendar.mode() === 'calendar')
                          dateRefs.get(id)?.focus();
                      };
                    };
                    return (
                      <DateChoice
                        presentation={props.target === 'tv' ? 'inline' : undefined}
                        value={value()}
                        label={dayLabel(value())}
                        testID={`calendar-date-${value()}`}
                        selected={calendar.effectiveDate() === value()}
                        buttonRef={(node) => {
                          ref = node;
                          dateRefs.set(value(), node);
                        }}
                        onFocus={() => props.onSource(restoreDate())}
                        onPress={() => {
                          const restore = restoreDate();
                          props.onNavigate();
                          ref?.focus();
                          calendar.setDate(value());
                          props.onSource(restore);
                        }}
                      />
                    );
                  }}
                </Each>
              </CardControls>
            </View>
          </Scroll>
        </If>
      </If>
      <If
        when={props.target !== 'tv' && calendar.mode() === 'calendar' && calendar.effectiveDate()}
      >
        <UiText role="section">
          {`${calendar.effectiveDate().slice(0, 4)}年 · ${calendarDateLabel(calendar.effectiveDate(), calendar.schema()?.current_date)}`}
        </UiText>
      </If>
      <If when={announcement()}>
        {(item) => (
          <View class="flex-1" testID="focus-entry-calendar-announcement">
            <ContentArrival class="flex-1 gap-4">
              <View class="items-end">
                <Button
                  label="收起安排"
                  testID="calendar-announcement-close"
                  variant="quiet"
                  buttonRef={(ref) => {
                    closeAnnouncement = ref;
                  }}
                  onFocus={() => announcementFocused.set(true)}
                  onBlur={() => announcementFocused.set(false)}
                  onPress={dismissAnnouncement}
                />
              </View>
              <Scroll
                ref={(ref) => {
                  announcementScroll = ref;
                  announcementOffset = 0;
                }}
                class="flex-1"
                testID="focus-region-calendar-announcement-content"
                focusable
                role="region"
                accessibilityLabel="上新安排"
                onFocus={() => announcementFocused.set(true)}
                onBlur={() => announcementFocused.set(false)}
                onLayout={({ bounds }) => {
                  announcementViewport = bounds.size.height;
                }}
                onScroll={({ offset }) => {
                  announcementOffset = offset.y;
                }}
              >
                <View class="flex-row gap-5 items-start">
                  <View
                    style={{
                      width: props.target === 'tv' ? 50 : 80,
                      height: props.target === 'tv' ? 70 : 112,
                    }}
                  >
                    <Cover src={cover(item())} title={title(item())} class="w-full h-full" />
                  </View>
                  <View class="flex-1 gap-2">
                    <UiText role="title">{title(item())}</UiText>
                    <UiText tone="muted">{calendarPublishLabel(item())}</UiText>
                    {/* The action stays above the prose: a long intro must not push 预约 off the
                        first screen. Prose is body copy, not a caption. */}
                    <If when={props.reservation}>
                      {(store) => (
                        <View class="gap-3">
                          <View class="self-start">
                            <ReservationAction
                              store={store()}
                              target={
                                item().reservation_id
                                  ? { kind: 'item', id: item().reservation_id! }
                                  : undefined
                              }
                              active={props.active && lifecycle() === 'active'}
                              testID="calendar-reservation"
                            />
                          </View>
                          <ReservationNotice
                            store={store()}
                            active={props.active && lifecycle() === 'active'}
                            testID="calendar-reservation-state"
                          />
                        </View>
                      )}
                    </If>
                    <If when={intro(item())}>
                      {/* Collapsed with an explicit trigger: the announcement can be long, and
                          docs/calendar-browsing.md requires the whole text to stay readable. */}
                      <ExpandableText
                        testID="calendar-announcement-intro"
                        text={intro(item())}
                        collapsedLines={props.target === 'tv' ? 2 : 4}
                        expandLabel="展开公告"
                        collapseLabel="收起公告"
                      />
                    </If>
                  </View>
                </View>
              </Scroll>
            </ContentArrival>
          </View>
        )}
      </If>
      <If when={calendar.loading() && !calendar.data()}>
        {/* The date strip and the list it governs, in the geometry they will occupy. */}
        <SkeletonRegion
          label="正在加载上新"
          testID="calendar-pending"
          class="flex-col"
          style={{ gap: props.target === 'tv' ? 12 : 20 }}
        >
          <View class="flex-row" style={{ gap: 12 }}>
            <Each of={[0, 1, 2]}>
              {() => (
                <SkeletonBlock width={props.target === 'tv' ? 120 : 180} height={84} radius={10} />
              )}
            </Each>
          </View>
          <Each of={[0, 1, 2]}>
            {() => (
              <View
                accessibilityElementsHidden
                class="flex-row items-center"
                style={{ gap: 20, paddingVertical: 12 }}
              >
                <SkeletonBlock
                  width={props.target === 'tv' ? 50 : 80}
                  height={props.target === 'tv' ? 70 : 112}
                  radius={8}
                />
                <View class="flex-1" style={{ gap: 8 }}>
                  <SkeletonBlock width="45%" height={20} radius={4} />
                  <SkeletonBlock width="30%" height={14} radius={4} />
                </View>
              </View>
            )}
          </Each>
        </SkeletonRegion>
      </If>
      <If when={calendar.data() && !items().length && !calendar.loading()}>
        <Notice
          message={
            calendar.data()?.has_more
              ? '本页暂无内容，可以继续浏览'
              : calendar.mode() === 'new'
                ? '暂时没有新剧'
                : '这天暂未安排上新'
          }
        />
      </If>
      <If when={calendar.error()}>
        <Notice
          error
          message={calendar.error()}
          retry={!calendar.data() ? calendar.retry : undefined}
        />
      </If>
      <If when={calendar.data()}>
        <View
          class={announcement() ? 'hidden' : 'flex-1'}
          disabled={!!announcement()}
          accessibilityElementsHidden={!!announcement()}
        >
          <List
            ref={(ref) => {
              list = ref;
            }}
            testID="calendar-results"
            class="flex-1"
            onLayout={({ bounds }) => {
              if (bounds.size.width > 0) width.set(bounds.size.width);
              if (bounds.size.height > 0) height.set(bounds.size.height);
              if (cardIntent) restoreCard();
            }}
            onScroll={() => {
              if (!props.active) return;
              const key = calendar.key();
              const revision = positionRevision;
              void list?.measureScrollPosition().then((position) => {
                if (
                  !disposed &&
                  props.active &&
                  revision === positionRevision &&
                  key === calendar.key() &&
                  position
                ) {
                  const item = items()[position.index * columns()];
                  if (item) anchors.set(key, { id: calendarItemId(item), offset: position.offset });
                }
              });
            }}
            each={Array.from({ length: Math.ceil(items().length / columns()) }, (_, index) => ({
              id: calendarItemId(items()[index * columns()]),
              items: items().slice(index * columns(), (index + 1) * columns()),
            }))}
            keyExtractor={(row) => row.id}
            estimatedItemSize={
              props.target === 'tv' ? cardWidth() * 1.35 + 84 : ((width() - 84) / 4) * 1.35 + 84
            }
            style={props.target === 'desktop' ? { width: '100%', maxWidth: 1100 } : undefined}
            contentStyle={{
              gap: props.target === 'tv' ? 6 : 12,
              paddingHorizontal: props.target === 'tv' ? 0 : 8,
              paddingVertical: props.target === 'tv' ? 4 : 0,
            }}
          >
            {(row) => (
              <View
                style={
                  props.target === 'tv' ? { width: '100%', padding: 6 } : { paddingVertical: 8 }
                }
              >
                <CardControls
                  label="上新短剧"
                  onNavigate={props.onNavigate}
                  class="w-full"
                  gap={props.target === 'tv' ? 16 : 28}
                >
                  <Each of={Array.from({ length: columns() }, (_, index) => index)}>
                    {(slot) => (
                      <View class="flex-1">
                        <If when={row().items[slot()]}>
                          {(item) => {
                            let ref: ViewRef | undefined;
                            effect(() => {
                              const id = calendarItemId(item());
                              if (ref) refs.set(id, ref);
                              if (cardIntent?.id === id) restoreCard();
                              cleanup(() => {
                                if (refs.get(id) === ref) refs.delete(id);
                              });
                            });
                            return (
                              <PosterCard
                                density={props.target === 'tv' ? 'compact' : undefined}
                                title={title(item())}
                                cover={cover(item())}
                                caption={caption(item())}
                                testID={`calendar-${calendarItemId(item())}`}
                                selected={calendar.selected() === calendarItemId(item())}
                                availableHeight={
                                  props.target === 'tv' ? undefined : Math.max(0, height() - 32)
                                }
                                width={
                                  props.target === 'tv'
                                    ? Math.min(132, cardWidth())
                                    : (width() - 84) / 4 - 4
                                }
                                fit={props.target === 'tv' ? 'contain' : undefined}
                                buttonRef={(node) => {
                                  ref = node;
                                  refs.set(calendarItemId(item()), node);
                                  if (cardIntent?.id === calendarItemId(item())) restoreCard();
                                }}
                                onFocus={() => {
                                  if (cardIntent?.id === calendarItemId(item()))
                                    cardIntent = undefined;
                                  props.onSource(source(calendarItemId(item())));
                                }}
                                onPress={() => {
                                  props.onNavigate();
                                  const restore = source(calendarItemId(item()));
                                  props.onSource(restore);
                                  calendar.selected.set(calendarItemId(item()));
                                  const entry = item().entry;
                                  if (entry.kind === 'released') props.onOpen(entry.drama, restore);
                                  else {
                                    const owns = props.focusGuard();
                                    cancelAnimationFrame(announcementFrame);
                                    announcementFrame = requestAnimationFrame(() => {
                                      if (!disposed && props.active && owns() && announcement())
                                        closeAnnouncement?.focus();
                                    });
                                  }
                                }}
                              />
                            );
                          }}
                        </If>
                      </View>
                    )}
                  </Each>
                </CardControls>
              </View>
            )}
          </List>
        </View>
      </If>
      <If when={calendar.data()?.has_more && !announcement()}>
        <View class="items-start">
          <Button
            label={
              calendar.loading() ? '正在加载…' : calendar.error() ? '重试加载更多' : '加载更多'
            }
            pending={calendar.loading()}
            displayLabel={calendar.loading() ? '正在加载…' : undefined}
            testID="calendar-more"
            buttonRef={(ref) => {
              more = ref;
            }}
            onFocus={moreSource}
            onPress={() => {
              if (calendar.loading()) return;
              props.onNavigate();
              more?.focus();
              moreSource();
              moreIntent = { key: calendar.key(), owns: props.focusGuard() };
              calendar.loadMore();
            }}
            onFocusedRemoval={
              platform.os === 'macos'
                ? () => {
                    if (!calendar.data()?.has_more && !calendar.error()) focusPrimary();
                  }
                : undefined
            }
          />
        </View>
      </If>
    </View>
  );
}
