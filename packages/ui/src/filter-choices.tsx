import { Text, View, Scroll, signal, effect, cleanup, type ViewRef } from 'nsh';
import { Select } from 'nsh/base';
import { Button } from './button';
import { CardControls } from './card-controls';
import { Product, tvUnit } from './foundation';

/** Approved desktop choice row / TV selector. The caller owns the service value. */
export function FilterChoices(props: {
  label: string;
  testID: string;
  value: string;
  items: { value: string; title: string }[];
  onChange: (value: string) => void;
  active: boolean;
  onSource?: (restore: () => void) => void;
  onNavigate?: () => void;
}) {
  const open = signal(false);
  let trigger: ViewRef | undefined;
  const refs = new Map<string, ViewRef>();
  effect(() => {
    if (!props.active) open.set(false);
  });
  const title = () => props.items.find((item) => item.value === props.value)?.title ?? '';
  return (
    <If
      when={Product() === 'tv'}
      else={
        <View class="flex-row items-start gap-6">
          <View class="w-10 pt-2">
            <Text class="text-sm text-muted-foreground">{props.label}</Text>
          </View>
          <Scroll horizontal class="flex-1 h-11">
            <CardControls
              label={props.label}
              onNavigate={props.onNavigate}
              class="gap-2 flex-nowrap"
            >
              <Each of={Array.from({ length: props.items.length }, (_, index) => index)}>
                {(slot) => {
                  const item = () => props.items[slot()];
                  let ref: ViewRef | undefined;
                  effect(() => {
                    const value = item().value;
                    if (ref) refs.set(value, ref);
                    cleanup(() => {
                      if (refs.get(value) === ref) refs.delete(value);
                    });
                  });
                  const source = () => {
                    const value = item().value;
                    return () => refs.get(value)?.focus();
                  };
                  return (
                    <Button
                      buttonRef={(node) => {
                        ref = node;
                        refs.set(item().value, node);
                      }}
                      onFocus={() => props.onSource?.(source())}
                      compact
                      variant="quiet"
                      testID={`${props.testID}-${item().value || 'all'}`}
                      label={item().title}
                      selected={props.value === item().value}
                      onPress={() => {
                        const restore = source();
                        props.onChange(item().value);
                        props.onSource?.(restore);
                      }}
                    />
                  );
                }}
              </Each>
            </CardControls>
          </Scroll>
        </View>
      }
    >
      <Select
        testID={props.testID}
        accessibilityLabel={props.label}
        items={props.items}
        value={props.value}
        open={open()}
        onOpenChange={({ open: value }) => open.set(value)}
        onChange={({ value }) => {
          if (value !== null) {
            props.onChange(value);
            props.onSource?.(() => trigger?.focus());
          }
        }}
        trigger={
          <Button
            buttonRef={(ref) => {
              trigger = ref;
            }}
            onFocus={() => props.onSource?.(() => trigger?.focus())}
            testID={`${props.testID}-trigger`}
            label={`${props.label}：${title()}`}
            displayLabel={
              props.value ? title() : props.label === '排序' ? '综合排序' : `全部${props.label}`
            }
            selectOpen={open()}
            icon="down"
            onPress={() => open.set(true)}
          />
        }
        popupClass="bg-card border border-border rounded-(--radius) p-2"
        itemClass="p-3 text-foreground hover:bg-muted focus:bg-accent selected:bg-accent"
        itemStyle={{ fontSize: tvUnit(24) }}
      />
    </If>
  );
}
