import { Image, Scroll, View, signal, cleanup, effect, lifecycle, type ViewRef } from 'nsh';
import {
  Avatar,
  Button,
  ContentArrival,
  Dialog,
  Field,
  Notice,
  Product,
  Select,
  Tabs,
  TextInput,
  UiText,
  tvUnit,
} from '@hongguo/ui';
import type { Store } from '../store';
import { errorMessage } from '../error-messages';
import { accountCountries, createAccountState, type AccountUiState } from '../account-state';
import { AccountLibrary } from '../AccountLibrary';

const loginStatus: Record<string, string> = {
  pending: '请用红果短剧 App 扫码',
  scanned: '已扫码，请在手机上确认',
  processing: '正在确认登录',
  code_sent: '验证码已发送',
  uncertain: '发送状态未确认，请等待后重试',
  mfa: '需要短信验证',
  expired: '登录已过期，请重新开始',
  cancelled: '登录已取消',
  failed: '登录未完成，请重试',
};

/** Shared account flow; Product supplies the existing desktop/TV control adaptations. */
export function Account(props: { store: Store; openUpdates?: (restore: () => void) => void }) {
  let updatesRef: ViewRef | undefined;
  let loginRef: ViewRef | undefined;
  let logoutRef: ViewRef | undefined;
  let qrRef: ViewRef | undefined;
  let countryRef: ViewRef | undefined;
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
  const login = () => view().login;
  const blocked = () => view().busy || props.store.account.loading();
  const qrAllowed = () => props.store.account()?.qr_login_available === true;
  const phoneAllowed = () => props.store.account()?.phone_login_available === true;
  const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);
  const refresh = async () => {
    try {
      await flow.cancel();
      props.store.account.refetch();
    } catch {
      // The controller keeps an unconfirmed cancellation sealed for the next explicit retry.
    }
  };
  return (
    <View class="flex-1">
      <Scroll class="flex-1">
        <View class="gap-6 p-5 md:p-8">
          <View class="flex-row items-center justify-between gap-4">
            <UiText role="page">账号</UiText>
            <If when={props.openUpdates}>
              <Button
                label="应用更新"
                buttonRef={(ref) => {
                  updatesRef = ref;
                }}
                onPress={() => props.openUpdates?.(() => updatesRef?.focus())}
              />
            </If>
          </View>
          <View class="gap-6">
            <View class="flex-row items-center gap-4">
              <Avatar
                name={props.store.account()?.profile?.name || '未登录'}
                size="lg"
                accessibilityLabel=""
              />
              <UiText role="section">
                {props.store.account()?.logged_in
                  ? props.store.account()?.profile?.name || '已登录'
                  : '还未登录'}
              </UiText>
            </View>
            <View class="self-start">
              <If when={props.store.account()?.logged_in}>
                <Button
                  label="退出登录"
                  disabled={blocked()}
                  pending={view().busy}
                  buttonRef={(ref) => {
                    logoutRef = ref;
                  }}
                  onPress={() => {
                    void flow.logout();
                  }}
                  testID="account-logout"
                />
              </If>
              <If when={!props.store.account()?.logged_in}>
                <Button
                  label="登录账号"
                  primary
                  disabled={blocked()}
                  buttonRef={(ref) => {
                    loginRef = ref;
                  }}
                  onPress={() => dialogOpen.set(true)}
                  testID="account-login-open"
                />
              </If>
            </View>
          </View>
          <AccountLibrary store={props.store} />
          <View class="self-start">
            <Button
              label="查看追更"
              testID="account-following"
              onPress={() => {
                props.store.navigate('following');
                props.store.restoreFocus();
              }}
            />
          </View>
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
      <Dialog
        open={dialogOpen()}
        title="登录账号"
        closeButton
        onOpenChange={({ open }) => dialogOpen.set(open)}
        initialFocus={() => {
          if (view().method === 'qr') qrRef?.focus();
          else countryRef?.focus();
        }}
        returnFocus={() => {
          if (!pageActive()) return;
          if (props.store.account()?.logged_in) logoutRef?.focus();
          else loginRef?.focus();
        }}
        testID="account-login-dialog"
      >
        <View class="gap-5">
          <Tabs
            label="登录方式"
            value={view().method}
            options={[
              { value: 'qr', label: '扫码登录', disabled: !qrAllowed() },
              { value: 'phone', label: '手机号登录', disabled: !phoneAllowed() },
            ]}
            onChange={({ value }) => flow.setMethod(value === 'phone' ? 'phone' : 'qr')}
            testID="account-method"
          />
          <If when={view().method === 'qr'}>
            <View class="items-center gap-4">
              <If when={login()?.method === 'qr' && login()?.image && !view().expired}>
                <ContentArrival>
                  <Image
                    src={login()?.image}
                    accessibilityLabel="红果 App 登录二维码"
                    style={{ width: unit(224), height: unit(224) }}
                  />
                </ContentArrival>
              </If>
              <If when={login() || view().expired}>
                <UiText tone="muted">
                  {view().expired
                    ? loginStatus.expired
                    : loginStatus[login()?.state ?? ''] || '等待登录确认'}
                </UiText>
              </If>
              <Button
                label={login() ? '刷新二维码' : '获取登录二维码'}
                primary
                pending={view().busy}
                disabled={blocked() || !qrAllowed()}
                onPress={() => {
                  void flow.startQr();
                }}
                buttonRef={(ref) => {
                  qrRef = ref;
                }}
                testID="account-qr-start"
              />
              <If when={!qrAllowed() && !props.store.account.loading()}>
                <UiText tone="muted">当前扫码登录不可用</UiText>
              </If>
              <If when={login() && !view().expired}>
                <Button
                  label="取消登录"
                  variant="quiet"
                  onPress={() => {
                    void flow.cancel().catch(() => {});
                  }}
                />
              </If>
            </View>
          </If>
          <If when={view().method === 'phone'}>
            <View class="gap-4">
              <Field label="国家或地区">
                <Select
                  label="国家或地区"
                  value={view().country}
                  options={accountCountries}
                  disabled={blocked()}
                  onChange={({ value }) => {
                    if (value) flow.setCountry(value);
                  }}
                  selectRef={(ref) => {
                    countryRef = ref;
                  }}
                  testID="account-country"
                />
              </Field>
              <Field label="手机号">
                <TextInput
                  label="手机号"
                  value={view().phone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={13}
                  disabled={blocked()}
                  onChange={({ value }) => flow.setPhone(value)}
                  testID="account-phone"
                />
              </Field>
              <Field label="验证码">
                <View class="flex-row items-center gap-3">
                  <View class="flex-1 min-w-0">
                    <TextInput
                      label="验证码"
                      value={view().code}
                      keyboardType="number-pad"
                      autoComplete="one-time-code"
                      maxLength={8}
                      disabled={blocked()}
                      onChange={({ value }) => flow.setCode(value)}
                      onSubmit={() => {
                        void flow.submit();
                      }}
                      testID="account-code"
                    />
                  </View>
                  <Button
                    label={view().retryIn ? `${view().retryIn} 秒后重试` : '获取验证码'}
                    disabled={blocked() || !phoneAllowed() || view().retryIn > 0}
                    onPress={() => {
                      void flow.sendCode();
                    }}
                    testID="account-send-code"
                  />
                </View>
              </Field>
              <Button
                label="使用 App 已有验证码"
                variant="quiet"
                disabled={blocked() || !phoneAllowed()}
                onPress={() => {
                  void flow.useExistingCode();
                }}
                testID="account-existing-code"
              />
              <If when={login()?.method === 'phone'}>
                <UiText tone="muted">
                  {view().expired
                    ? loginStatus.expired
                    : (login()?.state === 'pending'
                        ? '输入验证码后登录'
                        : loginStatus[login()?.state ?? '']) || ''}
                </UiText>
              </If>
              <If when={login()?.state !== 'mfa'}>
                <Button
                  label="登录"
                  primary
                  pending={view().busy}
                  disabled={blocked() || !phoneAllowed() || view().expired}
                  onPress={() => {
                    void flow.submit();
                  }}
                  testID="account-phone-login"
                />
              </If>
              <If when={login()?.state === 'mfa'}>
                <ContentArrival class="gap-4">
                  <UiText>
                    使用 {login()?.phone || '当前手机号'} 向 {login()?.sms_number || '指定号码'}{' '}
                    发送以下短信
                  </UiText>
                  <UiText selectable>{login()?.sms_content || '短信内容暂不可用'}</UiText>
                  <If when={login()?.sms_image}>
                    <Image
                      src={login()?.sms_image}
                      accessibilityLabel="上行短信验证二维码"
                      style={{ width: unit(224), height: unit(224) }}
                    />
                  </If>
                  <Button
                    label="已发送，查询验证结果"
                    primary
                    pending={view().busy}
                    disabled={blocked() || view().expired}
                    onPress={() => {
                      void flow.verify();
                    }}
                    testID="account-phone-verify"
                  />
                </ContentArrival>
              </If>
              <If when={login()}>
                <Button
                  label="取消登录"
                  variant="quiet"
                  onPress={() => {
                    void flow.cancel().catch(() => {});
                  }}
                />
              </If>
            </View>
          </If>
          <If when={failure()}>
            <Notice
              error
              message={failure()}
              retry={() => {
                void refresh();
              }}
            />
          </If>
        </View>
      </Dialog>
    </View>
  );
}
