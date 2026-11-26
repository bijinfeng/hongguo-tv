import { Image, View, token, type ViewRef } from 'nsh';
import {
  Button,
  ContentArrival,
  Dialog,
  Field,
  Notice,
  Select,
  Tabs,
  TextInput,
  UiText,
  radius,
} from '@hongguo/ui';
import { accountCountries, type AccountUiState } from '../../account-state';
import type { createAccountState } from '../../account-state';

export type AccountFlow = ReturnType<typeof createAccountState>;

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

/** The shared scan and phone form; account state and the attempt itself stay in the page. */
export function LoginDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: AccountUiState;
  flow: AccountFlow;
  qrAllowed: boolean;
  phoneAllowed: boolean;
  blocked: boolean;
  failure: string;
  tv: boolean;
  onRetry: () => void;
  returnFocus: () => void;
}) {
  let qrRef: ViewRef | undefined;
  let countryRef: ViewRef | undefined;
  const login = () => props.view.login;
  /** A field-tagged error belongs beside its input; everything else stays at the dialog foot. */
  const phoneError = () => (props.view.errorField === 'phone' ? props.view.error : '');
  const codeError = () => (props.view.errorField === 'code' ? props.view.error : '');
  return (
    <Dialog
      open={props.open}
      title="登录账号"
      size={props.tv ? 'lg' : 'md'}
      closeButton
      onOpenChange={({ open }) => props.onOpenChange(open)}
      initialFocus={() => {
        if (props.view.method === 'qr') qrRef?.focus();
        else countryRef?.focus();
      }}
      returnFocus={props.returnFocus}
      testID="account-login-dialog"
    >
      <View
        class={props.tv ? 'gap-4' : 'gap-5'}
        style={props.tv ? { alignSelf: 'center', width: 420 } : undefined}
      >
        <Tabs
          label="登录方式"
          value={props.view.method}
          options={[
            { value: 'qr', label: '扫码登录', disabled: !props.qrAllowed },
            { value: 'phone', label: '手机号登录', disabled: !props.phoneAllowed },
          ]}
          onChange={({ value }) => props.flow.setMethod(value === 'phone' ? 'phone' : 'qr')}
          testID="account-method"
        />
        <If when={props.view.method === 'qr'}>
          <View class="items-center gap-3">
            <If
              when={!login()?.image || props.view.expired}
              else={
                <ContentArrival>
                  <Image
                    src={login()?.image}
                    accessibilityLabel="红果 App 登录二维码"
                    style={{ width: 224, height: 224 }}
                  />
                </ContentArrival>
              }
            >
              {/* Before a QR exists, the dialog keeps its own area so the button never jumps. */}
              <QrPlaceholder state={props.view.expired ? '已过期' : '等待二维码'} tv={props.tv} />
            </If>
            <View class="items-center gap-4">
              <If when={login() || props.view.expired}>
                <UiText tone="muted">
                  {props.view.expired
                    ? loginStatus.expired
                    : loginStatus[login()?.state ?? ''] || '等待登录确认'}
                </UiText>
              </If>
              <Button
                label={login() ? '刷新二维码' : '获取登录二维码'}
                primary
                pending={props.view.busy}
                disabled={props.blocked || !props.qrAllowed}
                onPress={() => {
                  void props.flow.startQr();
                }}
                buttonRef={(ref) => {
                  qrRef = ref;
                }}
                testID="account-qr-start"
              />
              <If when={!props.qrAllowed}>
                <UiText tone="muted">当前扫码登录不可用</UiText>
              </If>
              <If when={login() && !props.view.expired}>
                <Button
                  label="取消登录"
                  variant="quiet"
                  onPress={() => {
                    void props.flow.cancel().catch(() => {});
                  }}
                />
              </If>
            </View>
          </View>
        </If>
        <If when={props.view.method === 'phone'}>
          <View class="gap-4">
            <Field label="国家或地区">
              <Select
                label="国家或地区"
                value={props.view.country}
                options={accountCountries}
                disabled={props.blocked}
                onChange={({ value }) => {
                  if (value) props.flow.setCountry(value);
                }}
                selectRef={(ref) => {
                  countryRef = ref;
                }}
                testID="account-country"
              />
            </Field>
            {/* A validation error stays on the field that has to change, not at the dialog foot. */}
            <Field label="手机号" error={phoneError()}>
              <TextInput
                activation={props.tv ? 'confirm' : 'direct'}
                label="手机号"
                value={props.view.phone}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={13}
                disabled={props.blocked}
                invalid={!!phoneError()}
                description={phoneError()}
                onChange={({ value }) => props.flow.setPhone(value)}
                testID="account-phone"
              />
            </Field>
            <Field label="验证码" error={codeError()}>
              <View class="flex-row items-center gap-3">
                <View class="flex-1 min-w-0">
                  <TextInput
                    activation={props.tv ? 'confirm' : 'direct'}
                    label="验证码"
                    value={props.view.code}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={8}
                    disabled={props.blocked}
                    onChange={({ value }) => props.flow.setCode(value)}
                    onSubmit={() => {
                      void props.flow.submit();
                    }}
                    testID="account-code"
                  />
                </View>
                <Button
                  label={props.view.retryIn ? `${props.view.retryIn} 秒后重试` : '获取验证码'}
                  disabled={props.blocked || !props.phoneAllowed || props.view.retryIn > 0}
                  onPress={() => {
                    void props.flow.sendCode();
                  }}
                  testID="account-send-code"
                />
              </View>
            </Field>
            <Button
              label="使用 App 已有验证码"
              variant="quiet"
              disabled={props.blocked || !props.phoneAllowed}
              onPress={() => {
                void props.flow.useExistingCode();
              }}
              testID="account-existing-code"
            />
            <If when={login()?.method === 'phone' || props.view.expired}>
              <UiText tone="muted">
                {props.view.expired
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
                pending={props.view.busy}
                disabled={props.blocked || !props.phoneAllowed || props.view.expired}
                onPress={() => {
                  void props.flow.submit();
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
                    style={{ width: 224, height: 224 }}
                  />
                </If>
                <Button
                  label="已发送，查询验证结果"
                  primary
                  pending={props.view.busy}
                  disabled={props.blocked || props.view.expired}
                  onPress={() => {
                    void props.flow.verify();
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
                  void props.flow.cancel().catch(() => {});
                }}
              />
            </If>
          </View>
        </If>
        <If when={props.failure && !props.view.errorField}>
          <Notice
            error
            message={props.failure}
            retry={props.onRetry}
            testID="account-login-feedback"
          />
        </If>
      </View>
    </Dialog>
  );
}

/** The scan target's own frame before a real code exists; no code is drawn or implied. */
function QrPlaceholder(props: { state: string; tv?: boolean }) {
  const side = () => (props.tv ? 150 : 224);
  return (
    <View
      accessibilityLabel={`二维码区域，${props.state}`}
      class="items-center justify-center"
      style={{
        width: side(),
        height: side(),
        borderWidth: 1,
        borderColor: token('input'),
        borderRadius: radius('xl'),
        borderStyle: 'dashed',
      }}
    >
      <UiText tone="muted">{props.state}</UiText>
    </View>
  );
}
