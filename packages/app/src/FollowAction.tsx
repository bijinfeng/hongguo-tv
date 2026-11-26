import { View, type ViewRef } from 'nsh';
import { Button, CinemaButton, Notice, UiText } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import type { Store } from './store';

/** Shared detail action; membership and all network work belong to the store. */
export function FollowAction(props: {
  store: Store;
  drama?: Drama;
  active: boolean;
  /** Draws the cinema pairing for the dark player band; the detail page keeps the page button. */
  cinema?: boolean;
  buttonRef?: (ref: ViewRef) => void;
}) {
  const follow = props.store.follow;
  const signedIn = () => props.store.account()?.logged_in === true;
  const membership = () => (props.drama ? follow.membership(props.drama.series_id) : undefined);
  const observed = () =>
    follow.snapshot()?.items.some((item) => item.series_id === props.drama?.series_id) === true;
  const ended = () => props.drama?.series_status === 'ended' && membership() !== true;
  const pending = () =>
    follow.mutation()?.series_id === props.drama?.series_id &&
    follow.mutation()?.state === 'pending';
  const label = () => (observed() ? '已追更' : signedIn() && ended() ? '已完结' : '追更');
  const blocked = () =>
    !props.active ||
    !props.drama ||
    props.drama.content_type === '1003' ||
    (signedIn() && (membership() === undefined || follow.stale() || follow.busy() || ended()));
  const press = () => {
    if (!props.active || !props.drama) return;
    props.store.noteFocusIntent();
    if (!signedIn()) {
      props.store.accountPage();
      props.store.restoreFocus();
      return;
    }
    if (membership() === undefined || follow.stale() || follow.busy() || ended()) return;
    void follow.set(props.drama.series_id, !membership()).catch(() => {});
  };
  return (
    <If
      when={props.cinema}
      else={
        <Button
          testID="detail-follow"
          label={label()}
          displayLabel={label()}
          icon="bell"
          buttonRef={props.buttonRef}
          selected={observed()}
          pending={pending()}
          disabled={blocked()}
          onPress={press}
        />
      }
    >
      <CinemaButton
        testID="detail-follow"
        label={label()}
        icon="bell"
        buttonRef={props.buttonRef}
        selected={observed()}
        pending={pending()}
        disabled={blocked()}
        onPress={press}
      />
    </If>
  );
}

/** Recovery always targets the controller's original intent, including after a season change. */
export function FollowNotice(props: { store: Store; active: boolean; testID: string }) {
  const follow = props.store.follow;
  const mutation = () => follow.mutation();
  const unresolved = () => ['unknown', 'unconfirmed'].includes(mutation()?.state ?? '');
  const message = () =>
    unresolved()
      ? mutation()?.state === 'unconfirmed'
        ? '请求已提交，追更结果待确认。'
        : '追更结果待确认，请先刷新状态。'
      : follow.error() || (!follow.loading() && follow.stale() ? '当前追更列表尚未刷新。' : '');
  const refresh = () => {
    if (props.active && mutation()?.state !== 'pending') {
      props.store.noteFocusIntent();
      void follow.refresh().catch(() => {});
    }
  };
  return (
    <If when={props.store.account()?.logged_in}>
      <If when={follow.loading() && !follow.snapshot()}>
        <UiText tone="muted" testID={`${props.testID}-loading`}>
          正在读取追更状态…
        </UiText>
      </If>
      <If when={message()}>
        <View class="gap-3" testID={props.testID}>
          <Notice error message={message()} retryLabel="刷新状态" retry={refresh} />
          <If when={unresolved()}>
            <View class="flex-row">
              <Button
                testID={`${props.testID}-retry`}
                label={mutation()?.enabled ? '重试追更' : '重试取消追更'}
                disabled={!props.active || follow.loading()}
                onPress={() => {
                  if (props.active) {
                    props.store.noteFocusIntent();
                    void follow.retry().catch(() => {});
                  }
                }}
              />
            </View>
          </If>
        </View>
      </If>
    </If>
  );
}
