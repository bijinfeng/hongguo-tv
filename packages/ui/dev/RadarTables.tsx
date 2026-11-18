import { View, batch, signal } from 'nsh';
import { Button } from '../src/button';
import { UiText } from '../src/display';
import { type ProductTarget } from '../src/foundation';
import {
  RadarTable,
  type RadarTableColumn,
  type RadarTableRef,
  type RadarTableRow,
} from '../src/radar-table';

const first = '9007199254740992';
const second = '9007199254740993';
const later = '129';
const columns: RadarTableColumn[] = [
  { key: 'rank', title: '榜位', numeric: true },
  { key: 'title', title: '短剧' },
  { key: 'type', title: '类型' },
  { key: 'hot', title: '热度', numeric: true },
  { key: 'd_hot', title: '热度变化', numeric: true },
  { key: 'd_fav', title: '收藏变化', numeric: true },
  { key: 'd7_hot', title: '七次采样变化', numeric: true },
  { key: 'status', title: '状态' },
];
const rows: RadarTableRow[] = [
  {
    id: first,
    title: '春日来信',
    cells: {
      rank: '1',
      type: '真人',
      hot: '9223372036854775807',
      d_hot: '-9223372036854775808',
      d_fav: '0',
      d7_hot: '—',
      status: '合成样例',
    },
  },
  {
    id: second,
    title: '重逢以后，那封跨越漫长岁月的来信终于送到了你的手中',
    cells: { rank: '—', type: '未知', hot: '—', d_hot: '0', d_fav: '-3', status: '合成样例' },
  },
  ...Array.from({ length: 30 }, (_, index) => ({
    id: String(100 + index),
    title: `合成短剧 ${index + 1}`,
    cells: {
      rank: String(index + 3),
      type: '真人',
      hot: '0',
      d_hot: '—',
      d_fav: '-1',
      status: '合成样例',
    },
  })),
];

/** An external owner exercises presentation contracts without catalog, media or history services. */
export function RadarTables(props: { target: ProductTarget }) {
  const selected = signal(first);
  const requested = signal('none');
  const source = signal('none');
  const presses = signal(0);
  const accepted = signal(true);
  const active = signal(true);
  const empty = signal(false);
  const wide = signal(true);
  const pending = signal('');
  let table: RadarTableRef | undefined;
  let intent = 0;
  const restore = (id: string) => {
    const owner = ++intent;
    table?.restore(id, () => owner === intent);
  };
  const reset = () => {
    batch(() => {
      selected.set(first);
      requested.set('none');
      presses.set(0);
      accepted.set(true);
      active.set(true);
      empty.set(false);
      wide.set(true);
      pending.set('');
    });
    restore(first);
  };
  return (
    <>
      <View class="flex-1 min-h-0 bg-background p-8 gap-3">
        <UiText role="section">只读表格基础组件验收</UiText>
        <View class="flex-row flex-wrap gap-3">
          <Button
            testID="radar-sample-reject"
            label="拒绝选择"
            onPress={() => accepted.set(false)}
          />
          <Button
            testID="radar-sample-accept"
            label="接受选择"
            onPress={() => accepted.set(true)}
          />
          <Button
            testID="radar-sample-external"
            label="外部选择"
            onPress={() => selected.set(second)}
          />
          <Button testID="radar-sample-reset" label="重置并聚焦首行" onPress={reset} />
          <Button
            testID="radar-sample-columns"
            label="切换列集"
            onPress={() => {
              intent++;
              wide.set(!wide());
            }}
          />
          <Button
            testID="radar-sample-empty"
            label="切换空表"
            onPress={() => {
              intent++;
              empty.set(!empty());
            }}
          />
          <Button
            testID="radar-sample-pending"
            label="切换读取中"
            onPress={() => pending.set(pending() ? '' : selected())}
          />
          <Button
            testID="radar-sample-active"
            label="切换恢复许可"
            onPress={() => {
              intent++;
              active.set(!active());
            }}
          />
          <Button testID="radar-sample-first" label="恢复首行" onPress={() => restore(first)} />
          <Button testID="radar-sample-second" label="恢复第二行" onPress={() => restore(second)} />
          <Button testID="radar-sample-later" label="恢复后段行" onPress={() => restore(later)} />
          <Button
            testID="radar-sample-stale"
            label="模拟过期返回"
            onPress={() => {
              const owner = intent++;
              table?.restore(later, () => owner === intent);
            }}
          />
        </View>
        <UiText role="meta">{`selected:${selected()} · requested:${requested()} · presses:${presses()}`}</UiText>
        <UiText role="meta">{`source:${source()} · active:${active()} · columns:${wide() ? 'wide' : 'compact'} · rows:${empty() ? 0 : rows.length} · pending:${pending() || 'none'}`}</UiText>
        <If when={empty()}>
          <UiText>暂无条目</UiText>
        </If>
        <RadarTable
          focusMode={props.target === 'tv' ? 'row' : 'cell'}
          collection={wide() ? 'wide' : 'compact'}
          columns={
            wide()
              ? columns
              : columns.filter((column) => ['title', 'd_hot', 'status'].includes(column.key))
          }
          rows={empty() ? [] : rows}
          selected={selected()}
          pending={pending()}
          active={active()}
          tableRef={(ref) => {
            table = ref;
          }}
          onOpen={({ id }) =>
            batch(() => {
              requested.set(id);
              presses.set(presses() + 1);
              if (accepted()) selected.set(id);
            })
          }
          onSource={({ id }) => source.set(id)}
          onNavigate={() => {
            intent++;
          }}
        />
      </View>
    </>
  );
}
