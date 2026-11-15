import { Notice } from '@hongguo/ui';
import type { Store } from './store';
import { observeAccountLibraryState } from './account-library-observer';

/** A committed local membership never implies a completed cloud round. */
export function LibrarySyncNotice(props: { store: Store; active: boolean; testID: string }) {
  observeAccountLibraryState(props.store, () => props.active);
  const sync = () => props.store.account()?.sync;
  const visible = () =>
    props.store.account()?.logged_in &&
    (sync()?.state === 'error' ||
      sync()?.state === 'syncing' ||
      sync()?.state === 'pending' ||
      !!sync()?.pending);
  const message = () =>
    sync()?.state === 'error'
      ? sync()?.error || '本机记录已保留，账号同步未完成。'
      : sync()?.pending
        ? `账号有 ${sync()?.pending} 项待同步。`
        : '账号正在同步。';
  return (
    <If when={visible()}>
      <Notice
        testID={props.testID}
        message={message()}
        error={sync()?.state === 'error'}
        retryLabel="查看同步"
        retry={() => {
          props.store.accountPage();
          props.store.restoreFocus();
        }}
      />
    </If>
  );
}
