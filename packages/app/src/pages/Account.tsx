import { Scroll, View, signal, cleanup, effect, lifecycle, type ViewRef } from 'nsh';
import { BackButton, Notice, UiText, space } from '@hongguo/ui';
import type { Store } from '../store';
import { errorMessage } from '../error-messages';
import { createAccountState, type AccountUiState } from '../account-state';
import { AccountLibrary } from '../AccountLibrary';
import { AccountIdentity } from './account/identity';
import { AccountContent, AccountContentActions } from './account/content';
import { LoginDialog } from './account/login-dialog';

/** Shared account flow; density comes from the app root. */
export function Account(props: {
  store: Store;
  tv?: boolean;
  openUpdates?: (restore: () => void) => void;
  openNotifications?: (restore: () => void) => void;
}) {
  let loginRef: ViewRef | undefined;
  let logoutRef: ViewRef | undefined;
  let updatesRowRef: ViewRef | undefined;
  const dialogOpen = signal(false);
  const view = signal<AccountUiState>({
    method: 'qr',
    busy: false,
    error: '',
    country: '+86',
    phone: '',
    code: '',
    retryIn: 0,
    expired: false,
  });
  const flow = createAccountState({
    account: () => props.store.account(),
    command: (command, abort) => props.store.accountCommand(command, abort),
    onChange: (state) => view.set(state),
  });
  const pageActive = () =>
    lifecycle() === 'active' && props.store.nav.routes().at(-1)?.name === 'account';
  effect(() => {
    const signedIn = props.store.account()?.logged_in === true;
    if (!pageActive() || signedIn) dialogOpen.set(false);
    // Authenticated page actions stay active; only an open dialog owns a guest attempt.
    flow.setActive(pageActive() && (signedIn || dialogOpen()));
  });
  cleanup(() => flow.dispose());
  const failure = () =>
    view().error ||
    errorMessage(props.store.account.error() || props.store.account()?.error, '账号操作未完成');
  const blocked = () => view().busy || props.store.account.loading();
  const qrAllowed = () => props.store.account()?.qr_login_available === true;
  const phoneAllowed = () => props.store.account()?.phone_login_available === true;
  const refresh = async () => {
    try {
      await flow.cancel();
      props.store.account.refetch();
    } catch {
      // The controller keeps an unconfirmed cancellation sealed for the next explicit retry.
    }
  };
  const open = (section: 'following' | 'reservations' | 'notifications') => () => {
    props.store.noteFocusIntent();
    props.store.navigate(section);
    props.store.restoreFocus();
  };
  const content = {
    onFollowing: open('following'),
    onReservations: open('reservations'),
    onNotifications: props.openNotifications ? open('notifications') : undefined,
    onUpdates: props.openUpdates
      ? () => {
          // Closing the update dialog returns to the entry that opened it, not the login row.
          props.openUpdates?.(() => updatesRowRef?.focus());
        }
      : undefined,
    onUpdatesRef: (ref: ViewRef) => {
      updatesRowRef = ref;
    },
    signedIn: props.store.account()?.logged_in === true,
  };
  return (
    <View class="flex-1">
      <Scroll
        testID="account-scroll"
        class="flex-1 min-h-0"
        contentStyle={{ flexDirection: 'column' }}
      >
        <View
          class={props.tv ? 'gap-4' : 'gap-6 p-5 md:p-8'}
          style={props.tv ? { paddingBottom: space('xl') } : undefined}
        >
          <BackButton
            testID="account-back"
            label={props.store.backLabel()}
            onPress={() => props.store.back()}
          />
          <UiText role="page">账号</UiText>
          <View
            class="flex-wrap"
            style={
              props.tv
                ? { flexDirection: 'column', gap: space('sm') }
                : { flexDirection: 'row', gap: space('lg'), alignItems: 'stretch' }
            }
          >
            <View
              class={props.tv ? 'w-full' : undefined}
              style={props.tv ? undefined : { flexGrow: 1.15, flexBasis: 340, minWidth: 0 }}
            >
              <AccountIdentity
                name={props.store.account()?.profile?.name}
                avatar={props.store.account()?.profile?.avatar ?? undefined}
                signedIn={props.store.account()?.logged_in === true}
                unready={!props.store.account() && props.store.account.loading()}
                busy={blocked()}
                tv={props.tv}
                testID="account-summary"
                actions={props.tv ? <AccountContentActions {...content} /> : undefined}
                loginRef={(ref) => {
                  loginRef = ref;
                }}
                logoutRef={(ref) => {
                  logoutRef = ref;
                }}
                onLogin={() => dialogOpen.set(true)}
                onLogout={() => {
                  void flow.logout();
                }}
              />
            </View>
            <If when={!props.tv}>
              <View style={{ flexGrow: 0.85, flexBasis: 280, minWidth: 0 }}>
                <AccountContent {...content} />
              </View>
            </If>
          </View>
          <AccountLibrary store={props.store} tv={props.tv} />
          <If when={failure() && !dialogOpen()}>
            <Notice
              error
              message={failure()}
              retry={() => {
                void refresh();
              }}
            />
          </If>
        </View>
      </Scroll>
      <LoginDialog
        open={dialogOpen()}
        onOpenChange={(open) => dialogOpen.set(open)}
        view={view()}
        flow={flow}
        qrAllowed={qrAllowed()}
        phoneAllowed={phoneAllowed()}
        blocked={blocked()}
        failure={failure()}
        tv={!!props.tv}
        onRetry={() => {
          void refresh();
        }}
        returnFocus={() => {
          if (!pageActive()) return;
          if (props.store.account()?.logged_in) logoutRef?.focus();
          else loginRef?.focus();
        }}
      />
    </View>
  );
}
