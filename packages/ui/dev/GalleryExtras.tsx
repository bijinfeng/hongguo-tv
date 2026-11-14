import { View, signal, type InputRef, type JSX } from 'nsh';
import {
  UiText,
  Surface,
  Button,
  Badge,
  Avatar,
  Checkbox,
  Switch,
  Select,
  ResultRow,
  SearchInput,
  SearchPicker,
  SearchSuggestionRow,
  FilterChoices,
  DownloadProgress,
  StoryFeature,
  ResultCard,
  EpisodePanel,
  CinemaStageAction,
  CinemaText,
  CinemaButton,
  CardControls,
  ActionBar,
  Product,
  tvUnit,
} from '../src/index';

function Row(props: { children?: JSX.Element }) {
  return <View class="flex-row flex-wrap items-center gap-3">{props.children}</View>;
}
function Block(props: { title: string; children?: JSX.Element }) {
  return (
    <View class="gap-4">
      <UiText role="title">{props.title}</UiText>
      {props.children}
    </View>
  );
}

/** The existing app's autocomplete controls, isolated from its search transport. */
export function GallerySearchRecipe() {
  const query = signal('');
  const shown = signal(false);
  const result = signal('');
  let input: InputRef | undefined;
  const choose = (value: string) => {
    query.set(value);
    result.set(`已选择：${value}`);
    shown.set(false);
    input?.focus();
  };
  return (
    <Block title="搜索建议组合">
      <Row>
        <SearchInput
          value={query()}
          onChange={(value) => query.set(value)}
          onSubmit={() => {
            result.set(query().trim() ? `搜索：${query().trim()}` : '请输入搜索内容');
            shown.set(false);
          }}
          inputRef={(ref) => (input = ref)}
          expanded={shown()}
        />
        <Button
          label="显示建议"
          onPress={() => shown.set(!shown())}
          testID="gallery-show-suggestions"
        />
      </Row>
      <If when={shown()}>
        <SearchPicker
          anchor={input}
          width={Product() === 'tv' ? tvUnit(720) : 560}
          onDismiss={() => shown.set(false)}
          onCancel={() => {
            shown.set(false);
            input?.focus();
          }}
          onNavigate={() => {}}
          onInput={() => input?.focus()}
        >
          <SearchSuggestionRow
            label="春山不负"
            meta="短剧 · 演示条目"
            icon="search"
            testID="gallery-suggestion-drama"
            rowRef={() => {}}
            onFocus={() => {}}
            onBlur={() => {}}
            onPress={() => choose('春山不负')}
          />
          <SearchSuggestionRow
            label="示例演员"
            meta="演员 · 演示条目"
            icon="user"
            testID="gallery-suggestion-actor"
            rowRef={() => {}}
            onFocus={() => {}}
            onBlur={() => {}}
            onPress={() => choose('示例演员')}
          />
        </SearchPicker>
      </If>
      <If when={!!result()}>
        <UiText>{result()}</UiText>
      </If>
    </Block>
  );
}

/** Navigation recipes use commands and readable position, without a second router. */
export function GalleryNavigationRecipes() {
  const active = signal('首页');
  const depth = signal(2);
  const page = signal(1);
  const batch = signal(1);
  return (
    <View class="gap-6">
      <Block title="主导航、返回与位置路径">
        <ActionBar label="示例主导航">
          <Each of={['首页', '分类', '观看记录']}>
            {(label) => (
              <Button
                label={label()}
                variant="navigation"
                selected={active() === label()}
                onPress={() => active.set(label())}
              />
            )}
          </Each>
        </ActionBar>
        <Row>
          <Button
            label="返回"
            icon="back"
            disabled={depth() === 0}
            onPress={() => depth.set(Math.max(0, depth() - 1))}
            testID="gallery-back"
          />
          <Button label="首页" variant="quiet" onPress={() => depth.set(0)} />
          <UiText tone="muted">/</UiText>
          <Button label="分类" variant="quiet" onPress={() => depth.set(1)} />
          <If when={depth() > 1}>
            <UiText tone="muted">/</UiText>
            <UiText>春山不负</UiText>
          </If>
        </Row>
        <UiText role="meta">{`当前位置：${depth() === 0 ? '首页' : depth() === 1 ? '分类' : '春山不负'}`}</UiText>
      </Block>
      <Block title="已知页数">
        <Row>
          <Button label="上一页" disabled={page() === 1} onPress={() => page.set(page() - 1)} />
          <Each of={[1, 2, 3, 4, 5]}>
            {(number) => (
              <Button
                label={String(number())}
                selected={page() === number()}
                onPress={() => page.set(number())}
                testID={`gallery-page-${number()}`}
              />
            )}
          </Each>
          <Button label="下一页" disabled={page() === 5} onPress={() => page.set(page() + 1)} />
        </Row>
        <UiText role="meta">{`第 ${page()} / 5 页`}</UiText>
      </Block>
      <Block title="未知总数">
        <UiText>{`已加载 ${batch() * 12} 条演示条目`}</UiText>
        <Button
          label={batch() === 3 ? '没有更多了' : '加载更多'}
          disabled={batch() === 3}
          onPress={() => batch.set(batch() + 1)}
          testID="gallery-load-more"
        />
      </Block>
    </View>
  );
}

/** Planned recipes are local examples, never claims about available source data. */
export function GalleryBusinessRecipes() {
  const date = signal('今天');
  const season = signal<string | null>('1');
  const genre = signal('');
  const sort = signal('');
  const reminder = signal(false);
  const selected = signal<string[]>([]);
  const records = signal(['春山不负', '重返 1998']);
  const current = signal('');
  return (
    <View class="gap-6">
      <UiText role="section">后续组合规划</UiText>
      <UiText role="meta">以下为静态示例数据；日期、分季、提醒与统计需真实能力支持后接入。</UiText>
      <Block title="日期条与分季选择">
        <Row>
          <Each of={['昨天', '今天', '明天']}>
            {(label) => (
              <Button
                label={label()}
                selected={date() === label()}
                onPress={() => date.set(label())}
              />
            )}
          </Each>
        </Row>
        <Select
          label="分季"
          value={season()}
          options={[
            { value: '1', label: '第一季' },
            { value: '2', label: '第二季' },
          ]}
          onChange={({ value }) => season.set(value)}
          testID="gallery-season"
        />
      </Block>
      <Block title="多维筛选">
        <FilterChoices
          label="题材"
          testID="gallery-filter-genre"
          value={genre()}
          active
          items={[
            { value: '', title: '全部' },
            { value: 'city', title: '都市' },
            { value: 'period', title: '古装' },
          ]}
          onChange={(value) => genre.set(value)}
        />
        <FilterChoices
          label="排序"
          testID="gallery-filter-sort"
          value={sort()}
          active
          items={[
            { value: '', title: '综合排序' },
            { value: 'new', title: '最新更新' },
          ]}
          onChange={(value) => sort.set(value)}
        />
      </Block>
      <Block title="榜位与演员行">
        <ResultRow
          title="春山不负"
          description="示例榜位"
          leading={<UiText role="numeric">01</UiText>}
          action={{ label: '查看详情', onPress: () => current.set('春山不负') }}
        />
        <ResultRow
          title="示例演员"
          description="演员资料行示例"
          leading={<Avatar name="林" />}
          action={{ label: '查看作品', onPress: () => current.set('示例演员作品') }}
        />
      </Block>
      <Block title="只读快照、提醒状态与独立统计">
        <Surface variant="muted">
          <UiText role="title">春山不负</UiText>
          <UiText>共 80 集 · 已完结</UiText>
          <Badge label="只读快照" />
        </Surface>
        <Row>
          <Switch
            label="示例提醒"
            checked={reminder()}
            onChange={({ checked }) => reminder.set(checked)}
          />
          <Badge
            label={reminder() ? '示例已预约' : '示例未预约'}
            tone={reminder() ? 'selected' : 'neutral'}
          />
        </Row>
        <Row>
          <UiText>示例条目</UiText>
          <UiText role="numeric">12</UiText>
          <UiText tone="muted">已选择</UiText>
          <UiText role="numeric">{String(selected().length)}</UiText>
        </Row>
      </Block>
      <Block title="记录管理与集合焦点">
        <Each of={records()} key={(item) => item}>
          {(item) => (
            <Checkbox
              label={item()}
              checked={selected().includes(item())}
              onChange={({ checked }) =>
                selected.set(
                  checked
                    ? [...selected(), item()]
                    : selected().filter((value) => value !== item()),
                )
              }
            />
          )}
        </Each>
        <Row>
          <Button
            label="移除所选示例"
            disabled={!selected().length}
            onPress={() => {
              records.set(records().filter((item) => !selected().includes(item)));
              selected.set([]);
            }}
          />
          <Button
            label="恢复示例"
            variant="quiet"
            onPress={() => records.set(['春山不负', '重返 1998'])}
          />
        </Row>
        <CardControls label="示例集合" class="gap-3">
          <Each of={['春山不负', '重返 1998', '第三个示例']}>
            {(label) => (
              <Button
                label={label()}
                selected={current() === label()}
                onPress={() => current.set(label())}
                testID={`gallery-collection-${label()}`}
              />
            )}
          </Each>
        </CardControls>
        <If when={!!current()}>
          <UiText>{`已选择：${current()}`}</UiText>
        </If>
      </Block>
      <Block title="内容焦点与结果组合">
        <StoryFeature
          title="春山不负"
          meta="共 80 集 · 演示信息"
          description="安安静静，看完一个好故事。"
        >
          <Row>
            <Button
              label="开始观看"
              variant="primary"
              icon="play"
              onPress={() => current.set('开始观看春山不负')}
            />
            <CinemaButton
              label="选集与详情"
              icon="list"
              onPress={() => current.set('查看春山不负详情')}
              testID="gallery-feature-details"
            />
          </Row>
        </StoryFeature>
        <ResultCard
          label="春山不负"
          selected={false}
          onPress={() => current.set('查看春山不负详情')}
          testID="gallery-result-card"
          buttonRef={() => {}}
        >
          <Avatar name="春" />
          <View class="flex-1 gap-2">
            <UiText role="title">春山不负</UiText>
            <UiText role="meta">共 80 集 · 演示结果</UiText>
          </View>
        </ResultCard>
      </Block>
    </View>
  );
}

export function GalleryTransferRecipe() {
  return (
    <Block title="更新下载进度">
      <DownloadProgress received={12582912} total={33554432} />
      <DownloadProgress received={4194304} />
    </Block>
  );
}

export function GalleryCinemaRecipe() {
  const open = signal(false);
  const paused = signal(true);
  return (
    <View class="gap-4">
      <View
        class="relative bg-cinema rounded-(--radius) overflow-hidden"
        style={{ height: Product() === 'tv' ? tvUnit(220) : 180 }}
      >
        <View class="p-4">
          <CinemaText>{paused() ? '已暂停 · 示例画面' : '播放中 · 示例画面'}</CinemaText>
        </View>
        <CinemaStageAction
          label="切换播放状态"
          showPlay={paused()}
          onPress={() => paused.set(!paused())}
        />
      </View>
      <Button
        label="打开播放器选集"
        onPress={() => open.set(true)}
        testID="gallery-open-episode-panel"
      />
      <EpisodePanel open={open()} onClose={() => open.set(false)} cinema>
        <CinemaText variant="title">选集 · 示例</CinemaText>
        <Row>
          <Each of={[1, 2, 3, 4]}>
            {(number) => (
              <CinemaButton
                label={`第 ${number()} 集`}
                selected={number() === 2}
                onPress={() => open.set(false)}
              />
            )}
          </Each>
        </Row>
      </EpisodePanel>
    </View>
  );
}
