import { Text, View, signal } from 'nsh';
import {
  Button,
  ConfirmDialog,
  Controls,
  Notice,
  UiText,
  space,
  textLineHeight,
  textSize,
} from '@hongguo/ui';
import type { Store } from '../../store';

/** Recent terms retain their existing persistence owner and explicit clear scope. */
export function SearchHistory(props: { store: Store }) {
  const confirmClear = signal(false);
  return (
    <View style={{ gap: space('sm') }}>
      <If when={!props.store.query()}>
        <View class="gap-4" style={{ gap: space('sm') }}>
          <View class="flex-row items-center justify-between">
            <UiText role="section">最近搜索</UiText>
            <If when={props.store.recent.items().length}>
              <Button
                testID="clear-recent-searches"
                label="清空搜索记录"
                variant="quiet"
                compact
                disabled={props.store.recent.saving()}
                onPress={() => confirmClear.set(true)}
              />
            </If>
          </View>
          <Controls label="最近搜索">
            <Each of={props.store.recent.items()} key={(term) => term}>
              {(term) => (
                <Button
                  label={term()}
                  testID={`recent-search-${term()}`}
                  compact
                  displayLabel={
                    Array.from(term()).length > 18
                      ? Array.from(term()).slice(0, 18).join('') + '…'
                      : term()
                  }
                  onPress={() => {
                    props.store.draft.set(term());
                    props.store.submit();
                  }}
                />
              )}
            </Each>
          </Controls>
          <If when={props.store.recent.loading() && !props.store.recent.ready()}>
            <Text class="text-base text-muted-foreground">正在加载…</Text>
          </If>
          <If when={props.store.recent.ready() && !props.store.recent.items().length}>
            <Text
              class="text-muted-foreground"
              style={{ fontSize: textSize('meta'), lineHeight: textLineHeight('meta') }}
            >
              暂无搜索记录
            </Text>
          </If>
        </View>
      </If>
      <If when={props.store.recent.error()}>
        <Notice
          error
          message={props.store.recent.error()}
          retryLabel={props.store.recent.retryLabel()}
          retry={() => {
            void props.store.recent.retry();
          }}
        />
      </If>
      <ConfirmDialog
        testID="clear-recent-confirm"
        open={confirmClear()}
        title="清空搜索记录？"
        description="只清空本机的最近搜索关键词；观看记录、收藏和各账号数据不受影响。"
        destructive
        confirmLabel="清空搜索记录"
        pending={props.store.recent.clearing()}
        // Only a clear failure belongs in this dialog; a previous save error is not this action's.
        error={confirmClear() ? props.store.recent.clearError() : ''}
        onOpenChange={(event) => {
          if (!event.open) confirmClear.set(false);
        }}
        returnFocus={() => props.store.focusSearchInput()}
        onConfirm={() => {
          // Close once the write settles so a failure stays readable in the dialog's error slot.
          void props.store.recent.clear().then(() => {
            if (!props.store.recent.error()) {
              props.store.focusSearchInput();
              confirmClear.set(false);
            }
          });
        }}
      />
    </View>
  );
}
