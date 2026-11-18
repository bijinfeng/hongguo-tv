import { Scroll, Text, View, signal, token, type JSX, type ViewRef, type ScrollRef } from 'nsh';
import {
  UiText,
  Surface,
  Badge,
  Avatar,
  Separator,
  Spinner,
  Icon,
  Button,
  IconButton,
  ActionBar,
  ActionBarGroup,
  ActionBarSeparator,
  Field,
  FieldGroup,
  TextInput,
  SearchField,
  Select,
  Checkbox,
  Switch,
  ChoiceGroup,
  Tabs,
  Slider,
  Dialog,
  ConfirmDialog,
  SidePanel,
  Menu,
  Popover,
  Tooltip,
  ToastRegion,
  Accordion,
  Disclosure,
  Link,
  KeyHint,
  InlineStatus,
  Notice,
  Empty,
  Skeleton,
  SkeletonBlock,
  SkeletonRegion,
  Progress,
  ResultRow,
  ExpandableText,
  RemovableChipGroup,
  SettingsRow,
  SettingsSection,
  PosterCard,
  ContinueCard,
  Cover,
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaText,
  EpisodePanel,
  space,
  type ProductTarget,
  type RemovableChip,
  type ToastMessage,
} from '../src/index';
import {
  GallerySearchRecipe,
  GalleryNavigationRecipes,
  GalleryBusinessRecipes,
  GalleryTransferRecipe,
  GalleryCinemaRecipe,
} from './GalleryExtras';

export const gallerySheets = [
  { id: 'foundation', label: '基础规范' },
  { id: 'controls', label: '按钮与操作' },
  { id: 'forms', label: '表单与选择' },
  { id: 'navigation', label: '导航与组织' },
  { id: 'layers', label: '弹层与反馈' },
  { id: 'content', label: '内容与列表' },
  { id: 'cinema', label: '播放器' },
  { id: 'feedback', label: '状态与进度' },
] as const;
export type GallerySheet = (typeof gallerySheets)[number]['id'];
export interface ComponentGalleryProps {
  target: ProductTarget;
  /** Initial sheet. Native tests switch using gallery-sheet-* controls. */
  sheet?: GallerySheet;
  /**
   * Renders every group at once instead of one at a time, so a visual pass captures the whole
   * gallery in one window without switching sheets; the group bar then scrolls to a group
   * (`reveal`) rather than swapping it. Behaviour tests keep the one-at-a-time default.
   */
  flat?: boolean;
}

const options = [
  { value: 'all', label: '全部' },
  { value: 'city', label: '都市' },
  { value: 'period', label: '古装' },
  { value: 'unavailable', label: '悬疑', disabled: true },
];
const initialChips: RemovableChip[] = [
  { id: 'city', label: '都市' },
  { id: 'finished', label: '已完结' },
];
const synopsis =
  '一场意外让她回到故事的起点。面对熟悉的选择，她决定重新出发，在平凡生活中找到属于自己的答案。旧日误会逐渐解开，新的相遇也在春山之间悄然发生。';

function Section(props: {
  title: string;
  children?: JSX.Element;
  /** Lets the flat gallery scroll a whole group into view by its first section. */
  viewRef?: (ref: ViewRef) => void;
}) {
  return (
    <View class="gap-4" ref={props.viewRef}>
      <UiText role="section">{props.title}</UiText>
      {props.children}
    </View>
  );
}

function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes < 10 ? '0' : ''}${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

/** Isolated acceptance fixture. It composes the public package without business or host settings. */
export function ComponentGallery(props: ComponentGalleryProps) {
  const sheet = signal<GallerySheet>(props.sheet ?? 'foundation');
  /** In flat mode every group is mounted, so a group is a scroll anchor rather than a swap. */
  const shown = (id: GallerySheet) => props.flat || sheet() === id;
  /** Scrolls to a laid-out group in flat mode; a stack page may not exist yet, so it waits a turn. */
  const anchor = (id: GallerySheet) => {
    void Promise.resolve().then(() => {
      anchors.get(id)?.reveal({ vertical: 'start', animated: false });
    });
  };
  const anchors = new Map<GallerySheet, ViewRef>();
  const select = (id: GallerySheet) => {
    sheet.set(id);
    result.set('');
    if (props.flat) anchor(id);
    else scroll?.scrollTo({ y: 0, animated: false });
  };
  const query = signal('');
  const searchPending = signal(false);
  const title = signal('春山不负');
  const result = signal('');
  const checked = signal(false);
  const mixed = signal(true);
  const enabled = signal(true);
  const selectionDisabled = signal(false);
  const selectDisabled = signal(false);
  const genre = signal<string | null>('all');
  const choice = signal('all');
  const tab = signal('all');
  const slider = signal(35);
  const sliderCommitted = signal(35);
  const sliderPreviews = signal(0);
  const sliderCommits = signal(0);
  const sliderCancels = signal(0);
  const sliderDisabled = signal(false);
  const accordion = signal<string[]>([]);
  const disclosure = signal(false);
  const chips = signal<RemovableChip[]>(initialChips);
  const dialog = signal(false);
  const confirm = signal(false);
  const pendingConfirm = signal(false);
  const confirmFailure = signal(false);
  const panel = signal(false);
  const confirmError = signal<string | undefined>(undefined);
  const toasts = signal<ToastMessage[]>([]);
  const playing = signal(false);
  const selectedAction = signal(true);
  const pendingAction = signal(false);
  const rate = signal('1');
  const position = signal(36);
  const volume = signal(60);
  const episode = signal(12);
  const episodePanel = signal(false);
  let dialogSource: ViewRef | undefined;
  let confirmSource: ViewRef | undefined;
  let panelSource: ViewRef | undefined;
  let scroll: ScrollRef | undefined;
  let sliderReset: ViewRef | undefined;
  let toastId = 0;
  const unit = (desktop: number, _tv = desktop) => desktop;
  const submit = () => result.set(query().trim() ? `搜索：${query().trim()}` : '请输入短剧或演员');
  const notify = () => {
    toastId += 1;
    toasts.set([...toasts(), { id: String(toastId), message: '设置已保存' }]);
  };
  return (
    <>
      <View class="flex-1 bg-background" style={{ padding: unit(32, 48), gap: unit(24, 24) }}>
        <View class="gap-2">
          <UiText role="page">基础组件验收</UiText>
          <UiText role="meta">演示数据，不连接账号、播放器或设备设置。</UiText>
        </View>
        <ActionBar label="组件分组">
          <Each of={gallerySheets} key={(item) => item.id}>
            {(item) => (
              <Button
                label={item().label}
                selected={sheet() === item().id}
                variant="navigation"
                testID={`gallery-sheet-${item().id}`}
                onPress={() => select(item().id)}
              />
            )}
          </Each>
        </ActionBar>
        <Scroll ref={(ref) => (scroll = ref)} class="flex-1" testID="gallery-scroll">
          <View
            class="gap-8"
            style={{ padding: Math.max(8, unit(8, 8)), paddingBottom: unit(32, 48) }}
          >
            <If when={shown('foundation')}>
              <Section title="文字与表面" viewRef={(ref) => anchors.set('foundation', ref)}>
                <UiText role="page">春山不负</UiText>
                <UiText role="section">继续观看</UiText>
                <UiText role="title">第 12 集</UiText>
                <UiText role="content-title">春山不负</UiText>
                <UiText>安安静静，看完一个好故事。</UiText>
                <UiText role="meta">共 80 集 · 已完结</UiText>
                <UiText role="numeric">12:36 / 24:00</UiText>
                <View class="flex-row flex-wrap gap-4">
                  <Surface>
                    <UiText>内容表面</UiText>
                  </Surface>
                  <Surface variant="muted">
                    <UiText>次级状态</UiText>
                  </Surface>
                  <Surface variant="page">
                    <UiText>边界分组</UiText>
                  </Surface>
                  <Surface variant="cinema">
                    <UiText tone="cinema">影院内容</UiText>
                  </Surface>
                </View>
                <Separator />
                <View class="flex-row flex-wrap items-center gap-4">
                  <Badge label="已完结" />
                  <Badge label="已选择" tone="selected" icon="check" />
                  <Badge label="加载失败" tone="error" icon="circle-alert" />
                  <Avatar name="游客" />
                  <Avatar name="林" size="lg" />
                  <Icon name="search" />
                  <Spinner label="加载中" />
                </View>
              </Section>
              <Section title="控件档位">
                <View class="flex-row flex-wrap items-center" style={{ gap: space('lg') }}>
                  <Checkbox
                    label="小号"
                    size="sm"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                  <Checkbox
                    label="中号"
                    size="md"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                  <Checkbox
                    label="大号"
                    size="lg"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                  <Switch
                    label="小号"
                    size="sm"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                  <Switch
                    label="中号"
                    size="md"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                  <Switch
                    label="大号"
                    size="lg"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                  />
                </View>
                <Slider
                  label="小号音量"
                  size="sm"
                  value={volume()}
                  max={100}
                  onChange={({ value }) => volume.set(value)}
                />
                <Slider
                  label="中号音量"
                  value={volume()}
                  max={100}
                  onChange={({ value }) => volume.set(value)}
                />
                <Slider
                  label="大号音量"
                  size="lg"
                  value={volume()}
                  max={100}
                  onChange={({ value }) => volume.set(value)}
                />
              </Section>
            </If>
            <If when={shown('controls')}>
              <Section title="按钮状态" viewRef={(ref) => anchors.set('controls', ref)}>
                <View class="flex-row flex-wrap items-center gap-3">
                  <Button
                    label="开始观看"
                    variant="primary"
                    icon="play"
                    onPress={() => result.set('已选择开始观看')}
                  />
                  <Button label="查看详情" onPress={() => result.set('已选择查看详情')} />
                  <Button label="取消" variant="quiet" onPress={() => result.set('已取消')} />
                  <Button
                    label="移除记录"
                    variant="destructive"
                    onPress={() => confirm.set(true)}
                  />
                  <IconButton label="关闭" icon="x" onPress={() => result.set('已关闭')} />
                </View>
                <View class="flex-row flex-wrap items-center gap-3">
                  <Button label="已选择" selected onPress={() => {}} />
                  <Button
                    label="不可用"
                    disabled
                    testID="gallery-disabled"
                    onPress={() => result.set('不应触发')}
                  />
                  <Button
                    label="保存"
                    pending
                    testID="gallery-pending"
                    onPress={() => result.set('不应触发')}
                  />
                  <Button label="小按钮" size="sm" onPress={() => result.set('小按钮已触发')} />
                  <Button label="大按钮" size="lg" onPress={() => result.set('大按钮已触发')} />
                </View>
                <View class="flex-row flex-wrap items-center gap-3">
                  <Button label="sm" size="sm" onPress={() => result.set('sm')} />
                  <Button label="md" onPress={() => result.set('md')} />
                  <Button label="lg" size="lg" onPress={() => result.set('lg')} />
                </View>
                <View class="flex-row flex-wrap items-center gap-3">
                  <Button
                    label={selectedAction() ? '已选择观看' : '选择观看'}
                    variant="primary"
                    icon={selectedAction() ? 'check' : 'play'}
                    selected={selectedAction()}
                    pending={pendingAction()}
                    testID="gallery-primary-selected"
                    onPress={() => selectedAction.set(!selectedAction())}
                  />
                  <Button
                    label="切换等待"
                    variant="quiet"
                    testID="gallery-toggle-pending"
                    onPress={() => pendingAction.set(!pendingAction())}
                  />
                  <Button label="已选择移除" variant="destructive" selected onPress={() => {}} />
                </View>
                <ActionBar label="记录操作">
                  <ActionBarGroup label="选择">
                    <Button label="选择全部" onPress={() => result.set('已选择全部')} />
                    <Button
                      label="取消选择"
                      variant="quiet"
                      onPress={() => result.set('已取消选择')}
                    />
                  </ActionBarGroup>
                  <ActionBarSeparator />
                  <Button label="完成" variant="primary" onPress={() => result.set('已完成')} />
                </ActionBar>
              </Section>
            </If>
            <If when={shown('forms')}>
              <Section title="输入与搜索" viewRef={(ref) => anchors.set('forms', ref)}>
                <SearchField
                  activation={props.target === 'tv' ? 'confirm' : 'direct'}
                  label="搜索短剧、演员"
                  placeholder="短剧、演员"
                  value={query()}
                  onChange={({ value }) => query.set(value)}
                  onSubmit={submit}
                  onClear={() => query.set('')}
                  testID="gallery-query"
                  pending={searchPending()}
                />
                <Button
                  label="切换搜索等待"
                  testID="gallery-query-pending"
                  variant="quiet"
                  onPress={() => searchPending.set(!searchPending())}
                />
                <FieldGroup label="输入档位">
                  <TextInput
                    label="小号输入框"
                    value={title()}
                    onChange={({ value }) => title.set(value)}
                    size="sm"
                  />
                  <TextInput
                    label="中号输入框"
                    value={title()}
                    onChange={({ value }) => title.set(value)}
                  />
                  <TextInput
                    label="大号输入框"
                    value={title()}
                    onChange={({ value }) => title.set(value)}
                    size="lg"
                  />
                </FieldGroup>
                <FieldGroup label="输入状态">
                  <TextInput
                    activation={props.target === 'tv' ? 'confirm' : 'direct'}
                    label="短剧名称"
                    value={title()}
                    onChange={({ value }) => title.set(value)}
                    testID="gallery-title"
                  />
                  <TextInput
                    activation={props.target === 'tv' ? 'confirm' : 'direct'}
                    label="只读信息"
                    value="共 80 集"
                    readonly
                    onChange={() => {}}
                  />
                  <TextInput
                    activation={props.target === 'tv' ? 'confirm' : 'direct'}
                    label="不可编辑"
                    value="暂不可用"
                    disabled
                    onChange={() => {}}
                    testID="gallery-input-disabled"
                  />
                  <Field label="短剧名称错误示例" error="请输入短剧名称">
                    <TextInput
                      activation={props.target === 'tv' ? 'confirm' : 'direct'}
                      label="短剧名称错误示例"
                      value=""
                      invalid
                      description="请输入短剧名称"
                      onChange={() => {}}
                      testID="gallery-input-invalid"
                    />
                  </Field>
                </FieldGroup>
              </Section>
              <Section title="选择与调整">
                <Select
                  label="题材"
                  value={genre()}
                  options={options}
                  disabled={selectDisabled()}
                  onChange={({ value }) => {
                    genre.set(value);
                    result.set(
                      `题材：${options.find((item) => item.value === value)?.label ?? '未选择'}`,
                    );
                  }}
                  testID="gallery-select"
                />
                <Button
                  label="打开后禁用题材选择"
                  variant="quiet"
                  testID="gallery-select-disable-after-open"
                  onPress={() => setTimeout(() => selectDisabled.set(true), 400)}
                />
                <View class="flex-row flex-wrap items-center gap-6">
                  <Checkbox
                    label="选择这条记录"
                    checked={checked()}
                    onChange={({ checked: value }) => checked.set(value)}
                    testID="gallery-checkbox"
                  />
                  <Checkbox
                    label="部分选择"
                    checked={false}
                    indeterminate={mixed()}
                    onChange={() => mixed.set(false)}
                  />
                  <Checkbox
                    label="不可选择"
                    checked={false}
                    disabled
                    onChange={() => {}}
                    testID="gallery-disabled-unchecked"
                  />
                  <Checkbox
                    label="已选且禁用"
                    checked
                    disabled
                    onChange={() => result.set('不应触发')}
                    testID="gallery-disabled-checked"
                  />
                  <Checkbox
                    label="部分选中且禁用"
                    checked={false}
                    indeterminate
                    disabled
                    onChange={() => result.set('不应触发')}
                    testID="gallery-disabled-mixed"
                  />
                  <Switch
                    label="开启且禁用"
                    checked
                    disabled
                    onChange={() => result.set('不应触发')}
                    testID="gallery-disabled-switch"
                  />
                  <Switch
                    label="关闭且禁用"
                    checked={false}
                    disabled
                    onChange={() => result.set('不应触发')}
                    testID="gallery-disabled-switch-off"
                  />
                  <Switch
                    label="自动连播"
                    checked={enabled()}
                    onChange={({ checked: value }) => enabled.set(value)}
                    testID="gallery-switch"
                  />
                </View>
                <UiText testID="gallery-form-state">{`${checked() ? '已选择 1 项' : '未选择记录'} · 自动连播${enabled() ? '开启' : '关闭'}`}</UiText>
                <ChoiceGroup
                  label="题材单选"
                  value={choice()}
                  options={options}
                  disabled={selectionDisabled()}
                  onChange={({ value }) => choice.set(value)}
                  testID="gallery-choice"
                />
                <Button
                  label="切换选择组可用性"
                  testID="gallery-choice-disabled"
                  onPress={() => selectionDisabled.set(!selectionDisabled())}
                />
                <Button
                  label="重置音量"
                  testID="gallery-slider-reset"
                  buttonRef={(ref) => (sliderReset = ref)}
                  onPress={() => {
                    slider.set(35);
                    sliderCommitted.set(35);
                    sliderPreviews.set(0);
                    sliderCommits.set(0);
                    sliderCancels.set(0);
                    sliderReset?.focus();
                  }}
                />
                <Slider
                  activation={props.target === 'tv' ? 'confirm' : 'direct'}
                  label="音量"
                  value={slider()}
                  min={0}
                  max={100}
                  disabled={sliderDisabled()}
                  onChange={({ value }) => {
                    slider.set(value);
                    sliderPreviews.set(sliderPreviews() + 1);
                  }}
                  onChangeEnd={({ value }) => {
                    sliderCommitted.set(value);
                    sliderCommits.set(sliderCommits() + 1);
                  }}
                  onCancel={() => sliderCancels.set(sliderCancels() + 1)}
                  testID="gallery-slider"
                />
                <Button
                  label="调整中禁用音量"
                  variant="quiet"
                  testID="gallery-slider-disable-after-edit"
                  onPress={() => setTimeout(() => sliderDisabled.set(true), 400)}
                />
                <UiText testID="gallery-slider-state">{`当前 ${slider()} · 已确认 ${sliderCommitted()}`}</UiText>
                <UiText
                  role="meta"
                  testID="gallery-slider-events"
                >{`调整 ${sliderPreviews()} 次 · 确认 ${sliderCommits()} 次 · 取消 ${sliderCancels()} 次`}</UiText>
              </Section>
              <GallerySearchRecipe />
            </If>
            <If when={shown('navigation')}>
              <Section title="导航与内容组织" viewRef={(ref) => anchors.set('navigation', ref)}>
                <Tabs
                  label="内容分类"
                  value={tab()}
                  options={options}
                  disabled={selectionDisabled()}
                  onChange={({ value }) => tab.set(value)}
                  testID="gallery-tabs"
                />
                <Button
                  label="切换标签组可用性"
                  testID="gallery-tabs-disabled"
                  onPress={() => selectionDisabled.set(!selectionDisabled())}
                />
                <Accordion
                  value={accordion()}
                  items={[
                    {
                      id: 'about',
                      title: '关于这部短剧',
                      content: <UiText>春山不负，共 80 集，已完结。</UiText>,
                    },
                    {
                      id: 'history',
                      title: '观看记录如何保存',
                      content: <UiText>观看记录保存在当前设备。</UiText>,
                    },
                    {
                      id: 'disabled',
                      title: '暂不可用',
                      disabled: true,
                      content: <UiText>暂无内容</UiText>,
                    },
                  ]}
                  onChange={({ value }) => accordion.set(value)}
                  testID="gallery-accordion"
                />
                <Disclosure
                  title="更多信息"
                  open={disclosure()}
                  onOpenChange={({ open }) => disclosure.set(open)}
                  testID="gallery-disclosure"
                >
                  <UiText>短剧信息以当前内容源为准。</UiText>
                </Disclosure>
                <Link label="项目文档" href="https://github.com/aston314/hongguo-tv" />
                <Link label="链接不可用" disabled />
                <KeyHint
                  keyLabel="Enter"
                  remoteLabel="确认"
                  remote={props.target === 'tv'}
                  label="打开所选内容"
                />
              </Section>
              <GalleryNavigationRecipes />
            </If>
            <If when={shown('layers')}>
              <Section title="弹层与轻反馈" viewRef={(ref) => anchors.set('layers', ref)}>
                <View class="flex-row flex-wrap gap-3">
                  <Button
                    label="打开对话框"
                    onPress={() => dialog.set(true)}
                    buttonRef={(ref) => (dialogSource = ref)}
                    testID="gallery-open-dialog"
                  />
                  <Button
                    label="移除观看记录"
                    onPress={() => {
                      confirmError.set(undefined);
                      confirm.set(true);
                    }}
                    buttonRef={(ref) => (confirmSource = ref)}
                    testID="gallery-open-confirm"
                  />
                  <Button
                    label="打开侧栏"
                    onPress={() => panel.set(true)}
                    buttonRef={(ref) => (panelSource = ref)}
                    testID="gallery-open-panel"
                  />
                  <Button label="保存设置" onPress={notify} testID="gallery-toast" />
                </View>
                <View class="flex-row flex-wrap gap-3">
                  <Menu
                    label="更多操作"
                    items={[
                      { id: 'details', label: '查看详情' },
                      { id: 'unavailable', label: '暂不可用', disabled: true },
                      {
                        id: 'remove',
                        label: '移除记录',
                        separatorBefore: true,
                        destructive: true,
                      },
                    ]}
                    onSelect={({ id }) => result.set(`已选择：${id}`)}
                    testID="gallery-menu"
                  />
                  <Popover label="观看记录说明" testID="gallery-popover">
                    <UiText>记录保存在当前设备，可随时移除。</UiText>
                  </Popover>
                  <View
                    tooltip={
                      <Tooltip
                        label="关闭当前面板"
                        testID="gallery-tooltip"
                        disabled={props.target === 'tv'}
                      />
                    }
                  >
                    <IconButton
                      label="关闭面板"
                      icon="x"
                      testID="gallery-tooltip-trigger"
                      onPress={() => result.set('面板已关闭')}
                    />
                  </View>
                </View>
                <Button
                  label="确认等待示例"
                  onPress={() => pendingConfirm.set(true)}
                  testID="gallery-open-confirm-pending"
                />
                <Button
                  label={confirmFailure() ? '确认失败已开启' : '切换确认失败'}
                  selected={confirmFailure()}
                  onPress={() => confirmFailure.set(!confirmFailure())}
                  testID="gallery-toggle-confirm-failure"
                />
                <Notice
                  message="网络暂时不可用，请稍后重试。"
                  error
                  retry={() => result.set('已请求重试')}
                />
              </Section>
            </If>
            <If when={shown('content')}>
              <Section title="内容与回退" viewRef={(ref) => anchors.set('content', ref)}>
                <View class="flex-row gap-6" style={{ maxWidth: unit(620, 860) }}>
                  <View style={{ width: unit(180, 260) }}>
                    <PosterCard
                      title="春山不负"
                      caption="共 80 集 · 已完结"
                      width={unit(180, 260)}
                      onPress={() => result.set('已选择春山不负')}
                      testID="gallery-poster"
                    />
                  </View>
                  <View style={{ width: unit(180, 260) }}>
                    <PosterCard
                      title="重返 1998：再一次走过漫长的人生"
                      caption="共 60 集"
                      width={unit(180, 260)}
                      selected
                      onPress={() => result.set('已选择重返 1998')}
                      testID="gallery-poster-selected"
                    />
                  </View>
                  <View style={{ width: unit(120, 160) }}>
                    <Cover title="封面暂不可用" height={unit(216, 240)} />
                  </View>
                </View>
                <ContinueCard
                  title="春山不负"
                  subtitle="第 12 集 · 上次看到 12:36"
                  position={756}
                  duration={1440}
                  label="继续观看"
                  onPress={() => result.set('继续第 12 集')}
                  buttonRef={() => {}}
                  accessibilityLabel="继续观看春山不负"
                />
                <ResultRow
                  title="春山不负"
                  description="共 80 集 · 已完结"
                  leading={<Avatar name="春" />}
                  action={{ label: '查看详情', onPress: () => result.set('查看春山不负详情') }}
                />
              </Section>
              <Section title="高频基础组件">
                <View style={{ maxWidth: unit(560, 760) }}>
                  <ExpandableText text={synopsis} testID="gallery-expandable" />
                </View>
                <RemovableChipGroup
                  label="已选条件"
                  values={chips()}
                  onRemove={({ id }) => chips.set(chips().filter((item) => item.id !== id))}
                  onClear={() => chips.set([])}
                  emptyAction={{ label: '重新选择', onPress: () => chips.set(initialChips) }}
                  testID="gallery-chips"
                />
                <SettingsSection title="偏好示例">
                  <SettingsRow label="自动连播" description="本集结束后继续播放下一集">
                    <Switch
                      label="内容区自动连播"
                      labelHidden
                      checked={enabled()}
                      onChange={({ checked: value }) => enabled.set(value)}
                    />
                  </SettingsRow>
                  <SettingsRow label="内容源" description="来自当前内容库" value="当前内容源" />
                </SettingsSection>
              </Section>
              <GalleryBusinessRecipes />
            </If>
            <If when={shown('cinema')}>
              <Section title="影院控件" viewRef={(ref) => anchors.set('cinema', ref)}>
                <View class="bg-cinema" style={{ padding: unit(32), borderRadius: unit(12) }}>
                  <View
                    class="flex-row items-center justify-between"
                    style={{ gap: unit(24), marginBottom: unit(32) }}
                  >
                    <View class="flex-row items-baseline" style={{ gap: unit(8) }}>
                      <CinemaText variant="title">重返1998</CinemaText>
                      <Text
                        class="text-cinema-muted tabular-nums"
                        style={{ fontSize: unit(14, 20) }}
                      >
                        第 {episode()} 集
                      </Text>
                    </View>
                    <CinemaButton
                      label="关闭播放"
                      icon="x"
                      iconOnly
                      quiet
                      onPress={() => result.set('关闭播放')}
                    />
                  </View>
                  <View class="flex-row items-center" style={{ gap: unit(20) }}>
                    <CinemaText variant="time">{clock(position())}</CinemaText>
                    <View class="flex-1 min-w-0" style={{ gap: unit(8) }}>
                      <Text class="text-cinema-foreground" style={{ fontSize: unit(14, 20) }}>
                        播放进度
                      </Text>
                      <CinemaSlider
                        label="播放进度"
                        value={position()}
                        max={120}
                        onChange={(value) => position.set(value)}
                        testID="gallery-cinema-slider"
                      />
                    </View>
                    <CinemaText variant="time">{clock(120)}</CinemaText>
                  </View>
                  <View
                    class="flex-row flex-wrap items-center justify-between"
                    style={{ gap: unit(24), marginTop: unit(24) }}
                  >
                    <View class="flex-row items-center" style={{ gap: unit(16) }}>
                      <CinemaButton
                        label={playing() ? '暂停' : '播放'}
                        icon={playing() ? 'pause' : 'play'}
                        iconOnly
                        onPress={() => playing.set(!playing())}
                        testID="gallery-play"
                      />
                      <CinemaButton
                        label="下一集"
                        icon="skip-forward"
                        iconOnly
                        disabled={episode() >= 18}
                        onPress={() => episode.set(Math.min(18, episode() + 1))}
                      />
                      <View class="flex-row items-center" style={{ gap: unit(20) }}>
                        <Icon
                          name={volume() === 0 ? 'volume-x' : 'volume-2'}
                          color={token('cinema-foreground')}
                        />
                        <View style={{ width: unit(120) }}>
                          <CinemaSlider
                            label="音量"
                            value={volume()}
                            max={100}
                            compact
                            onChange={(value) => volume.set(value)}
                          />
                        </View>
                      </View>
                    </View>
                    <View class="flex-row items-center" style={{ gap: unit(16) }}>
                      <View style={{ width: unit(200) }}>
                        <CinemaSelect
                          label="播放速度"
                          value={rate()}
                          items={[
                            { value: '0.75', title: '0.75×' },
                            { value: '1', title: '1.0×' },
                            { value: '1.25', title: '1.25×' },
                            { value: '1.5', title: '1.5×' },
                            { value: '2', title: '2.0×' },
                          ]}
                          onChange={(value) => rate.set(value)}
                        />
                      </View>
                      <CinemaButton
                        label="选集"
                        onPress={() => episodePanel.set(true)}
                        testID="gallery-open-episode-panel"
                      />
                      <CinemaButton
                        label="全屏"
                        icon="maximize"
                        iconOnly
                        onPress={() => result.set('切换全屏')}
                      />
                    </View>
                  </View>
                </View>
                <UiText role="meta">
                  {`${props.target === 'tv' ? '确认进入调整，左右预览，再次确认提交，返回取消。' : '可拖动或用方向键调整，结束调整后提交。'}样例进度 00:36 / 02:00，无真实视频。`}
                </UiText>
              </Section>
              <Section title="选集">
                <View style={{ gap: unit(12) }}>
                  <Each of={[0, 1, 2]}>
                    {(row) => (
                      <View class="flex-row" style={{ gap: unit(12) }}>
                        <Each of={[1, 2, 3, 4, 5, 6]}>
                          {(column) => (
                            <View class="flex-1">
                              <Button
                                label={String(row() * 6 + column())}
                                episode
                                selected={episode() === row() * 6 + column()}
                                onPress={() => episode.set(row() * 6 + column())}
                              />
                            </View>
                          )}
                        </Each>
                      </View>
                    )}
                  </Each>
                  <View
                    class="flex-row items-center"
                    style={{ gap: unit(16), marginTop: unit(12) }}
                  >
                    <Button label="下一集" icon="skip-forward" disabled onPress={() => {}} />
                    <UiText role="meta">已是最后一集</UiText>
                  </View>
                </View>
              </Section>
              <Section title="播放状态">
                <GalleryCinemaRecipe />
              </Section>
              <EpisodePanel open={episodePanel()} onClose={() => episodePanel.set(false)} cinema>
                <CinemaText variant="title">选集 · 示例</CinemaText>
                <View class="flex-row" style={{ gap: unit(12) }}>
                  <Each of={[1, 2, 3, 4]}>
                    {(number) => (
                      <View class="flex-1">
                        <CinemaButton
                          label={`第 ${number()} 集`}
                          selected={number() === episode()}
                          onPress={() => {
                            episode.set(number());
                            episodePanel.set(false);
                          }}
                        />
                      </View>
                    )}
                  </Each>
                </View>
              </EpisodePanel>
            </If>
            <If when={shown('feedback')}>
              <Section title="加载与反馈" viewRef={(ref) => anchors.set('feedback', ref)}>
                <InlineStatus status="loading" message="正在加载短剧" />
                <InlineStatus status="success" message="设置已保存" />
                <InlineStatus
                  status="error"
                  message="加载失败"
                  action={{ label: '重试', onPress: () => result.set('已请求重试') }}
                />
                <Progress value={35} max={100} label="传输进度" detail="35 / 100" />
                <Progress indeterminate label="正在连接" />
                <View class="flex-row gap-6">
                  <View class="flex-1">
                    <Skeleton variant="result" />
                  </View>
                  <View style={{ width: unit(140, 180) }}>
                    <Skeleton variant="poster" />
                  </View>
                </View>
                <Skeleton variant="text" />
                <SkeletonRegion label="正在加载片库" class="flex-row" style={{ gap: unit(20) }}>
                  <Each of={[1, 2, 3]}>
                    {() => (
                      <View style={{ width: unit(160, 180), gap: unit(12) }}>
                        <SkeletonBlock width="100%" height={unit(216, 243)} radius={unit(12)} />
                        <SkeletonBlock width="72%" height={unit(14, 18)} radius={unit(4)} />
                        <SkeletonBlock width="42%" height={unit(12, 16)} radius={unit(4)} />
                      </View>
                    )}
                  </Each>
                </SkeletonRegion>
              </Section>
              <Section title="空状态与恢复">
                <Empty
                  title="暂无观看记录"
                  description="看过的短剧会出现在这里。"
                  action={{ label: '浏览短剧', onPress: () => result.set('已选择浏览短剧') }}
                />
                <Empty
                  title="短剧加载失败"
                  description="请检查网络后重试。"
                  error
                  action={{ label: '重新加载', onPress: () => result.set('已请求重新加载') }}
                />
                <Notice
                  message="正在显示上次加载的内容。"
                  retry={() => result.set('已请求刷新')}
                  retryLabel="刷新"
                />
              </Section>
              <GalleryTransferRecipe />
            </If>
            <If when={!!result()}>
              <InlineStatus message={result()} testID="gallery-result" />
            </If>
          </View>
        </Scroll>
        <Dialog
          open={dialog()}
          title="观看记录"
          description="记录保存在当前设备。"
          onOpenChange={({ open }) => dialog.set(open)}
          returnFocus={() => dialogSource?.focus()}
          testID="gallery-dialog"
          footer={<Button label="完成" variant="primary" onPress={() => dialog.set(false)} />}
        >
          <UiText>春山不负 · 第 12 集</UiText>
        </Dialog>
        <ConfirmDialog
          open={confirm()}
          title="移除这条观看记录？"
          description="移除后无法恢复，短剧仍可正常观看。"
          confirmLabel="移除记录"
          destructive
          error={confirmError()}
          onOpenChange={({ open }) => confirm.set(open)}
          onConfirm={() => {
            if (confirmFailure()) {
              confirmError.set('演示操作失败，请重试。');
              confirmFailure.set(false);
              return;
            }
            result.set('记录已移除');
            confirm.set(false);
          }}
          onCancel={() => result.set('已保留观看记录')}
          returnFocus={() => confirmSource?.focus()}
          testID="gallery-confirm"
        />
        <SidePanel
          open={panel()}
          title="选集"
          onOpenChange={({ open }) => panel.set(open)}
          returnFocus={() => panelSource?.focus()}
          testID="gallery-panel"
        >
          <UiText>共 80 集 · 已完结</UiText>
          <Button
            label="第 12 集"
            selected
            onPress={() => {
              result.set('选择第 12 集');
              panel.set(false);
            }}
          />
        </SidePanel>
        <ConfirmDialog
          open={pendingConfirm()}
          title="正在移除示例记录"
          description="等待状态保留取消入口。"
          confirmLabel="移除记录"
          pending
          destructive
          onOpenChange={({ open }) => pendingConfirm.set(open)}
          onConfirm={() => {}}
          testID="gallery-confirm-pending"
        />
        <ToastRegion
          items={toasts()}
          onDismiss={({ id }) => toasts.set(toasts().filter((item) => item.id !== id))}
          testID="gallery-toasts"
        />
      </View>
    </>
  );
}
