import { View, signal, effect, cleanup, lifecycle, token, type ViewRef } from 'nsh';
import type { GuestHistoryImportResult } from '@hongguo/core-client';
import {
  ActionRow,
  Button,
  CardControls,
  ConfirmDialog,
  Notice,
  UiText,
  border,
  space,
} from '@hongguo/ui';
import type { Store } from './store';
import { errorMessage } from './error-messages';
import { observeAccountLibraryState } from './account-library-observer';
import { AccountCard } from './pages/account/card';

/** Account/library actions share Rust state; leaving never rolls back admitted work. */
export function AccountLibrary(props: { store: Store; tv?: boolean }) {
  const confirmation = signal<string | undefined>(undefined);
  const busy = signal<'sync' | 'import' | undefined>(undefined);
  const failure = signal('');
  const result = signal<GuestHistoryImportResult | undefined>(undefined);
  const reconciled = signal(false);
  let importRef: ViewRef | undefined;
  let historyRef: ViewRef | undefined;
  let returnSource: { scope: string; owns: () => boolean } | undefined;
  let disposed = false;
  const account = () => props.store.account();
  const signedIn = () => account()?.logged_in === true;
  const scope = () => JSON.stringify([account()?.owner_id, account()?.owner_epoch]);
  const active = () =>
    lifecycle() === 'active' && props.store.nav.routes().at(-1)?.name === 'account';
  const blocked = () => !!busy() || props.store.account.loading();
  const available = () => account()?.guest_history?.available ?? 0;
  const openLibrary = (kind: 'history' | 'favorites') => {
    props.store.openLibrary(kind);
    props.store.restoreFocus();
  };
  const syncLabel = () => {
    const sync = account()?.sync;
    if (sync?.state === 'syncing') return '正在同步';
    if (sync?.state === 'error') return sync.error || '同步未完成';
    if (sync?.pending) return `${sync.pending} 项待同步`;
    return sync?.last_sync ? '已同步' : '尚未同步';
  };
  let previousScope = scope();
  effect(() => {
    const next = scope();
    if (next !== previousScope) {
      previousScope = next;
      confirmation.set(undefined);
      failure.set('');
      result.set(undefined);
      reconciled.set(false);
    }
    if (!active() || !signedIn()) confirmation.set(undefined);
  });
  observeAccountLibraryState(props.store, active);
  cleanup(() => {
    disposed = true;
  });
  const refreshReturnGuard = () => {
    if (returnSource?.scope === scope() && active()) returnSource.owns = props.store.focusGuard();
  };
  const sync = async () => {
    if (blocked() || !signedIn()) return;
    const owned = scope();
    busy.set('sync');
    failure.set('');
    try {
      await props.store.accountCommand({ action: 'sync' });
    } catch (cause) {
      if (!disposed && scope() === owned) failure.set(errorMessage(cause, '同步未完成，请重试'));
    } finally {
      if (!disposed) busy.set(undefined);
    }
  };
  const importHistory = async () => {
    const owned = confirmation();
    if (!owned || owned !== scope() || blocked() || !active() || !signedIn()) return;
    refreshReturnGuard();
    busy.set('import');
    failure.set('');
    result.set(undefined);
    reconciled.set(false);
    try {
      const imported = await props.store.importGuestHistory();
      if (!disposed && scope() === owned) {
        result.set(imported);
        reconciled.set(imported === undefined);
        confirmation.set(undefined);
      }
    } catch (cause) {
      if (!disposed && scope() === owned)
        failure.set(errorMessage(cause, '合并结果尚未确认，请重试'));
    } finally {
      if (!disposed) busy.set(undefined);
    }
  };
  const title = () => (signedIn() ? '我的片库' : '本机片库');
  const destinations = () => (
    <View class="flex-col" style={{ gap: space('none') }}>
      <ActionRow
        label="观看记录"
        divided
        testID="account-history"
        buttonRef={(ref) => {
          historyRef = ref;
        }}
        onPress={() => openLibrary('history')}
      />
      <ActionRow
        label="收藏"
        divided
        testID="account-favorites"
        onPress={() => openLibrary('favorites')}
      />
    </View>
  );
  const syncDetails = () => (
    <View
      style={{
        gap: space('sm'),
        paddingTop: props.tv ? space('sm') : space('md'),
        borderTopWidth: border,
        borderTopColor: token('border'),
      }}
    >
      <View class="flex-row items-center justify-between" style={{ gap: space('sm') }}>
        <View class="flex-1 min-w-0" style={{ gap: space('xxs') }}>
          <If when={!props.tv}>
            <UiText role="body">本机与账号同步</UiText>
          </If>
          <UiText tone="muted" testID="account-sync-state">
            {syncLabel()}
          </UiText>
        </View>
        <Button
          label={account()?.sync.state === 'error' ? '重试同步' : '立即同步'}
          pending={busy() === 'sync' || account()?.sync.state === 'syncing'}
          disabled={blocked() || account()?.sync.state === 'syncing'}
          testID="account-sync"
          onPress={() => void sync()}
        />
      </View>
      <If when={!props.tv}>
        <UiText tone="muted">本机记录与账号记录分开保存；同步只更新当前账号。</UiText>
      </If>
      <If when={available() > 0}>
        <View class="self-start">
          <Button
            label={`合并登录前观看记录（${available()}）`}
            disabled={blocked()}
            pending={busy() === 'import'}
            testID="account-import-open"
            buttonRef={(ref) => {
              importRef = ref;
            }}
            onPress={() => {
              failure.set('');
              returnSource = { scope: scope(), owns: props.store.focusGuard() };
              confirmation.set(scope());
            }}
          />
        </View>
      </If>
      <If when={result()}>
        <Notice
          message={
            result()?.remaining
              ? `已合并 ${result()?.imported} 条记录，还剩 ${result()?.remaining} 条可合并。`
              : result()?.imported
                ? `已合并 ${result()?.imported} 条记录。`
                : '没有可合并的新记录。'
          }
        />
      </If>
      <If when={reconciled()}>
        <Notice message="合并结果未确认，已重新读取片库。" />
      </If>
    </View>
  );
  return (
    <View testID="account-library" class="shrink-0" style={{ gap: space('sm') }}>
      <If
        when={props.tv}
        else={
          <AccountCard title={title()}>
            {destinations()}
            <If when={signedIn()}>
              {syncDetails()}
              <If when={failure() && !confirmation()}>
                <Notice
                  error
                  message={failure()}
                  retry={() => void props.store.refreshAccountLibraryState().catch(() => {})}
                />
              </If>
            </If>
            <If when={!signedIn()}>
              <UiText tone="muted">登录不会自动合并本机观看记录，退出后仍可查看游客记录。</UiText>
            </If>
          </AccountCard>
        }
      >
        {/* A 960×540 surface fits one band of destinations; TV keeps the heading light and
            folds sync into the same row so the capability stays above the fold. */}
        <View class="flex-row items-center justify-between">
          <UiText role="title">{title()}</UiText>
          <If when={signedIn()}>
            <UiText tone="muted" testID="account-sync-state">
              {syncLabel()}
            </UiText>
          </If>
        </View>
        <CardControls label="我的片库">
          <Button
            label="观看记录"
            testID="account-history"
            buttonRef={(ref) => {
              historyRef = ref;
            }}
            onPress={() => openLibrary('history')}
          />
          <Button
            label="收藏"
            testID="account-favorites"
            onPress={() => openLibrary('favorites')}
          />
          <If when={signedIn()}>
            <Button
              label={account()?.sync.state === 'error' ? '重试同步' : '立即同步'}
              pending={busy() === 'sync' || account()?.sync.state === 'syncing'}
              disabled={blocked() || account()?.sync.state === 'syncing'}
              testID="account-sync"
              onPress={() => void sync()}
            />
            <If when={available() > 0}>
              <Button
                label={`合并登录前观看记录（${available()}）`}
                disabled={blocked()}
                pending={busy() === 'import'}
                testID="account-import-open"
                buttonRef={(ref) => {
                  importRef = ref;
                }}
                onPress={() => {
                  failure.set('');
                  returnSource = { scope: scope(), owns: props.store.focusGuard() };
                  confirmation.set(scope());
                }}
              />
            </If>
          </If>
        </CardControls>
        <If when={result()}>
          <Notice
            message={
              result()?.remaining
                ? `已合并 ${result()?.imported} 条记录，还剩 ${result()?.remaining} 条可合并。`
                : result()?.imported
                  ? `已合并 ${result()?.imported} 条记录。`
                  : '没有可合并的新记录。'
            }
          />
        </If>
        <If when={reconciled()}>
          <Notice message="合并结果未确认，已重新读取片库。" />
        </If>
        <If when={failure() && !confirmation()}>
          <Notice
            error
            message={failure()}
            retry={() => void props.store.refreshAccountLibraryState().catch(() => {})}
          />
        </If>
      </If>
      <ConfirmDialog
        open={!!confirmation()}
        title="合并登录前观看记录？"
        description={`将合并 ${available()} 条较新的观看记录，保留原观看时间和游客记录。合并后会同步到当前账号，不包含收藏。`}
        confirmLabel="合并记录"
        cancelLabel={busy() === 'import' ? '关闭' : '取消'}
        pending={busy() === 'import'}
        error={failure()}
        testID="account-import"
        onOpenChange={({ open }) => {
          if (!open) {
            refreshReturnGuard();
            confirmation.set(undefined);
          }
        }}
        onConfirm={() => void importHistory()}
        returnFocus={() => {
          const source = returnSource;
          returnSource = undefined;
          if (source && !disposed && active() && source.scope === scope() && source.owns())
            (available() > 0 ? importRef : historyRef)?.focus();
        }}
      />
    </View>
  );
}
