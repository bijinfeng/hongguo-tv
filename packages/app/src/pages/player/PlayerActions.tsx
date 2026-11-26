import { View, lifecycle } from 'nsh';
import type { Drama, Episode } from '@hongguo/core-client';
import { CinemaButton, CinemaText, Notice } from '@hongguo/ui';
import type { Store } from '../../store';
import { createDetailFavorite } from '../../detail-favorite';
import { FollowAction, FollowNotice } from '../../FollowAction';
import { ReservationAction, ReservationNotice } from '../../ReservationAction';
import { Bookmark } from 'nsh-icon-lucide';

/**
 * The player's own action line: bookmark, follow and reserve for the drama currently playing.
 * Membership and writes stay with the shared controllers, as on the detail page, so the two
 * surfaces cannot disagree about what the reader already owns.
 */
export function PlayerActions(props: {
  store: Store;
  drama: Drama;
  episode: Episode;
  active: () => boolean;
}) {
  const favorite = createDetailFavorite(
    props.store,
    () => props.drama,
    () => props.active() && lifecycle() === 'active',
  );
  const live = () => props.active() && lifecycle() === 'active';
  return (
    <View style={{ gap: 12 }}>
      <View class="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        <CinemaButton
          testID="player-favorite"
          label={favorite.selected() ? '已收藏' : '收藏'}
          icon={Bookmark}
          selected={favorite.selected()}
          pending={favorite.pending()}
          disabled={favorite.disabled()}
          onPress={() => void favorite.press()}
        />
        <FollowAction cinema store={props.store} drama={props.drama} active={live()} />
        <ReservationAction
          cinema
          store={props.store}
          target={{ kind: 'series', id: props.drama.series_id }}
          active={live()}
          testID="player-reservation"
        />
      </View>
      <If when={favorite.message()}>
        <View style={{ gap: 12 }}>
          <Notice testID="player-favorite-error" error message={favorite.message() ?? ''} />
          <If when={favorite.retryable()}>
            <View class="flex-row">
              <CinemaButton
                testID="player-favorite-retry"
                label={favorite.retryLabel()}
                onPress={() => void favorite.retry()}
              />
            </View>
          </If>
        </View>
      </If>
      <FollowNotice store={props.store} active={live()} testID="player-follow-state" />
      <ReservationNotice store={props.store} active={live()} testID="player-reservation-state" />
      <CinemaText>空格 播放 / 暂停 · ← / → 调整进度 · Esc 退出影院</CinemaText>
    </View>
  );
}
