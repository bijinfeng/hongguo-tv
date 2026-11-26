import { Text, View, signal, type ViewRef } from 'nsh';
import { Button } from '../src/button';
import { CardControls } from '../src/card-controls';
import { DateChoice } from '../src/date-choice';

/** Isolated controlled-date acceptance; no calendar service, inferred dates or business state. */
export function CalendarChoices() {
  const selected = signal('20240228');
  const requested = signal('none');
  const focused = signal('none');
  const accepted = signal(true);
  const presses = signal(0);
  let first: ViewRef | undefined;
  const choose = (value: string) => {
    requested.set(value);
    presses.set(presses() + 1);
    if (accepted()) selected.set(value);
  };
  return (
    <>
      <View class="flex-1 bg-background p-8 gap-6">
        <Text class="text-xl text-foreground">日期选择基础组件验收</Text>
        <CardControls label="示例日期" class="items-start">
          <Each of={['20240228', '20240229', '20240301']}>
            {(value) => (
              <DateChoice
                value={value()}
                label={value() === '20240301' ? '周五' : value() === '20240229' ? '周四' : '周三'}
                selected={selected() === value()}
                testID={`date-choice-${value()}`}
                buttonRef={(ref) => {
                  if (value() === '20240228') first = ref;
                }}
                onFocus={() => focused.set(value())}
                onPress={() => choose(value())}
              />
            )}
          </Each>
        </CardControls>
        <DateChoice
          value="20240301"
          label="周五"
          presentation="inline"
          selected={selected() === '20240301'}
          testID="date-choice-inline"
          onPress={() => choose('20240301')}
        />
        <View class="flex-row items-start" style={{ height: 108 }}>
          <DateChoice
            value="20000229"
            label="周二"
            selected={selected() === '20000229'}
            testID="date-choice-century-leap"
            onPress={() => choose('20000229')}
          />
          <Each
            of={[
              '19000229',
              '20230229',
              '20240431',
              '00000101',
              '20241301',
              '20240001',
              '20240100',
              '2024-02-29',
            ]}
          >
            {(value) => (
              <DateChoice
                value={value()}
                label="无效日期"
                selected={false}
                testID={`date-choice-invalid-${value()}`}
                onPress={() => choose(value())}
              />
            )}
          </Each>
        </View>
        <View class="flex-row gap-3">
          <Button
            label="暂停接受选择"
            testID="date-choice-hold"
            onPress={() => accepted.set(false)}
          />
          <Button
            label="外部选择闰日"
            testID="date-choice-external"
            onPress={() => selected.set('20240229')}
          />
          <Button
            label="重置并聚焦日期"
            testID="date-choice-reset"
            onPress={() => {
              selected.set('20240228');
              requested.set('none');
              presses.set(0);
              accepted.set(true);
              first?.focus();
            }}
          />
        </View>
        <Text class="text-base text-foreground">{`selected:${selected()}`}</Text>
        <Text class="text-base text-foreground">{`requested:${requested()} · presses:${presses()}`}</Text>
        <Text class="text-base text-foreground">{`focused:${focused()}`}</Text>
      </View>
    </>
  );
}
