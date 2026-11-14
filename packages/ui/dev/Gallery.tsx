import { Scroll, View, signal, type JSX, type ViewRef, type ScrollRef } from 'nsh';
import {
  Product,
  tvUnit,
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
  Progress,
  ResultRow,
  ExpandableText,
  RemovableChipGroup,
  SettingsRow,
  PosterCard,
  ContinueCard,
  Cover,
  CinemaControls,
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaText,
  CinemaSettingRow,
  EpisodeRail,
  EpisodeRange,
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
}

const options = [
  { value: 'all', label: '全部' },
  { value: 'city', label: '都市' },
  { value: 'period', label: '古装' },
  { value: 'unavailable', label: '暂不可用', disabled: true },
];
const initialChips: RemovableChip[] = [
  { id: 'city', label: '都市' },
  { id: 'finished', label: '已完结' },
];
const synopsis =
  '一场意外让她回到故事的起点。面对熟悉的选择，她决定重新出发，在平凡生活中找到属于自己的答案。旧日误会逐渐解开，新的相遇也在春山之间悄然发生。';

function Section(props: { title: string; children?: JSX.Element }) {
  return (
    <View class="gap-4">
      <UiText role="section">{props.title}</UiText>
      {props.children}
    </View>
  );
}

/** Isolated acceptance fixture. It composes the public package without business or host settings. */
export function ComponentGallery(props: ComponentGalleryProps) {
  const sheet = signal<GallerySheet>(props.sheet ?? 'foundation');
  const query = signal('');
  const title = signal('春山不负');
  const result = signal('');
  const checked = signal(false);
  const mixed = signal(true);
  const enabled = signal(true);
  const genre = signal<string | null>('all');
  const choice = signal('all');
  const tab = signal('all');
  const slider = signal(35);
  const sliderCommitted = signal(35);
  const sliderPreviews = signal(0);
  const sliderCommits = signal(0);
  const sliderCancels = signal(0);
  const accordion = signal<string[]>([]);
  const disclosure = signal(false);
  const chips = signal<RemovableChip[]>(initialChips);
  const dialog = signal(false);
  const confirm = signal(false);
  const pendingConfirm = signal(false);
  const panel = signal(false);
  const confirmError = signal<string | undefined>(undefined);
  const toasts = signal<ToastMessage[]>([]);
  const playing = signal(false);
  const rate = signal('1');
  const range = signal(0);
  let dialogSource: ViewRef | undefined;
  let confirmSource: ViewRef | undefined;
  let panelSource: ViewRef | undefined;
  let scroll: ScrollRef | undefined;
  let sliderReset: ViewRef | undefined;
  let toastId = 0;
  const unit = (desktop: number, tv = desktop) => (props.target === 'tv' ? tvUnit(tv) : desktop);
  const submit = () => result.set(query().trim() ? `搜索：${query().trim()}` : '请输入短剧或演员');
  const notify = () => {
    toastId += 1;
    toasts.set([...toasts(), { id: String(toastId), message: '设置已保存' }]);
  };
  return (
    <Product.Provider value={props.target}>
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
                onPress={() => {
                  sheet.set(item().id);
                  result.set('');
                  scroll?.scrollTo({ y: 0, animated: false });
                }}
              />
            )}
          </Each>
        </ActionBar>
        <Scroll ref={(ref) => (scroll = ref)} class="flex-1" testID="gallery-scroll">
          <View class="gap-8" style={{ paddingBottom: unit(32, 48) }}>
            <If when={sheet() === 'foundation'}>
              <Section title="文字与表面">
                <UiText role="page">春山不负</UiText>
                <UiText role="section">继续观看</UiText>
                <UiText role="title">第 12 集</UiText>
                <UiText>安安静静，看完一个好故事。</UiText>
                <UiText role="meta">共 80 集 · 已完结</UiText>
                <UiText role="numeric">12:36 / 24:00</UiText>
                <View class="flex-row flex-wrap gap-4">
                  <Surface>
                    <UiText>内容表面</UiText>
                  </Surface>
                  <Surface variant="muted">
                    <UiText>次级表面</UiText>
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
            </If>
            <If when={sheet() === 'controls'}>
              <Section title="按钮状态">
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
                    label="保存中"
                    pending
                    testID="gallery-pending"
                    onPress={() => result.set('不应触发')}
                  />
                  <Button label="小按钮" size="sm" onPress={() => result.set('小按钮已触发')} />
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
            <If when={sheet() === 'forms'}>
              <Section title="输入与搜索">
                <SearchField
                  label="搜索短剧、演员"
                  placeholder="短剧、演员"
                  value={query()}
                  onChange={({ value }) => query.set(value)}
                  onSubmit={submit}
                  onClear={() => query.set('')}
                  testID="gallery-query"
                />
                <FieldGroup label="输入状态">
                  <TextInput
                    label="短剧名称"
                    value={title()}
                    onChange={({ value }) => title.set(value)}
                    testID="gallery-title"
                  />
                  <TextInput label="只读信息" value="共 80 集" readonly onChange={() => {}} />
                  <TextInput label="不可编辑" value="暂不可用" disabled onChange={() => {}} />
                  <Field label="错误状态" error="请输入短剧名称">
                    <TextInput label="短剧名称错误示例" value="" invalid onChange={() => {}} />
                  </Field>
                </FieldGroup>
              </Section>
              <Section title="选择与调整">
                <Select
                  label="题材"
                  value={genre()}
                  options={options}
                  onChange={({ value }) => {
                    genre.set(value);
                    result.set(
                      `题材：${options.find((item) => item.value === value)?.label ?? '未选择'}`,
                    );
                  }}
                  testID="gallery-select"
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
                  <Checkbox label="不可选择" checked={false} disabled onChange={() => {}} />
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
                  onChange={({ value }) => choice.set(value)}
                  testID="gallery-choice"
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
                  label="音量"
                  value={slider()}
                  min={0}
                  max={100}
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
                <UiText testID="gallery-slider-state">{`当前 ${slider()} · 已确认 ${sliderCommitted()}`}</UiText>
                <UiText
                  role="meta"
                  testID="gallery-slider-events"
                >{`调整 ${sliderPreviews()} 次 · 确认 ${sliderCommits()} 次 · 取消 ${sliderCancels()} 次`}</UiText>
              </Section>
              <GallerySearchRecipe />
            </If>
            <If when={sheet() === 'navigation'}>
              <Section title="导航与内容组织">
                <Tabs
                  label="内容分类"
                  value={tab()}
                  options={options}
                  onChange={({ value }) => tab.set(value)}
                  testID="gallery-tabs"
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
                <KeyHint keyLabel="Enter" remoteLabel="确认" label="打开所选内容" />
              </Section>
              <GalleryNavigationRecipes />
            </If>
            <If when={sheet() === 'layers'}>
              <Section title="弹层与轻反馈">
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
                      { id: 'remove', label: '移除记录', separatorBefore: true, destructive: true },
                    ]}
                    onSelect={({ id }) => result.set(`已选择：${id}`)}
                    testID="gallery-menu"
                  />
                  <Popover label="观看记录说明" testID="gallery-popover">
                    <UiText>记录保存在当前设备，可随时移除。</UiText>
                  </Popover>
                  <View tooltip={<Tooltip label="关闭当前面板" testID="gallery-tooltip" />}>
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
                <Notice
                  message="网络暂时不可用，请稍后重试。"
                  error
                  retry={() => result.set('已请求重试')}
                />
              </Section>
            </If>
            <If when={sheet() === 'content'}>
              <Section title="内容与回退">
                <View class="flex-row gap-6" style={{ maxWidth: unit(620, 860) }}>
                  <View style={{ width: unit(180, 260) }}>
                    <PosterCard
                      title="春山不负"
                      caption="共 80 集 · 已完结"
                      width={180}
                      onPress={() => result.set('已选择春山不负')}
                      testID="gallery-poster"
                    />
                  </View>
                  <View style={{ width: unit(180, 260) }}>
                    <PosterCard
                      title="重返 1998"
                      caption="共 60 集"
                      width={180}
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
                <SettingsRow label="自动连播" description="本集结束后继续播放下一集">
                  <Switch
                    label="内容区自动连播"
                    checked={enabled()}
                    onChange={({ checked: value }) => enabled.set(value)}
                  />
                </SettingsRow>
                <SettingsRow label="内容源" value="当前内容源" />
              </Section>
              <GalleryBusinessRecipes />
            </If>
            <If when={sheet() === 'cinema'}>
              <Section title="播放器控件">
                <Surface variant="cinema">
                  <View class="relative" style={{ minHeight: unit(240, 420), gap: unit(16, 24) }}>
                    <CinemaText variant="title">春山不负 · 第 12 集</CinemaText>
                    <CinemaControls>
                      <View class="gap-4">
                        <CinemaSlider
                          label="播放进度"
                          value={slider()}
                          max={100}
                          onChange={(value) => slider.set(value)}
                          testID="gallery-cinema-slider"
                        />
                        <View class="flex-row flex-wrap items-center gap-3">
                          <CinemaButton
                            label={playing() ? '暂停' : '播放'}
                            icon={playing() ? 'pause' : 'play'}
                            onPress={() => playing.set(!playing())}
                            testID="gallery-play"
                          />
                          <CinemaButton label="上一集" icon="back" disabled onPress={() => {}} />
                          <CinemaButton
                            label="下一集"
                            icon="skip-forward"
                            onPress={() => result.set('下一集')}
                          />
                          <CinemaText>12:36 / 24:00</CinemaText>
                        </View>
                        <CinemaSettingRow label="倍速">
                          <CinemaSelect
                            label="播放倍速"
                            value={rate()}
                            items={[
                              { value: '1', title: '1.0×' },
                              { value: '1.5', title: '1.5×' },
                              { value: '2', title: '2.0×' },
                            ]}
                            onChange={(value) => rate.set(value)}
                          />
                        </CinemaSettingRow>
                      </View>
                    </CinemaControls>
                  </View>
                </Surface>
                <EpisodeRange
                  value={range()}
                  count={80}
                  pageSize={20}
                  onChange={(value) => range.set(value)}
                />
                <EpisodeRail>
                  <View class="flex-row flex-wrap" style={{ gap: unit(12) }}>
                    <Each of={[1, 2, 3, 4, 5, 6]}>
                      {(episode) => (
                        <View style={{ width: (unit(316, 640) - 2 - unit(36)) / 4 }}>
                          <Button
                            label={String(episode())}
                            episode
                            selected={episode() === 3}
                            onPress={() => result.set(`选择第 ${episode()} 集`)}
                          />
                        </View>
                      )}
                    </Each>
                  </View>
                </EpisodeRail>
                <GalleryCinemaRecipe />
              </Section>
            </If>
            <If when={sheet() === 'feedback'}>
              <Section title="加载与反馈">
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
    </Product.Provider>
  );
}
