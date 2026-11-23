import { Text, View, Scroll, signal, effect, cleanup, token, type ViewRef } from 'nsh';
import { Select } from 'nsh/base';
import { Button } from './button';
import { selectItemClass, SelectItemLabel, selectItemLineHeight } from './select';
import { CardControls } from './card-controls';
import { border, radius, space, type ControlSize } from './foundation';
import { textSize, textWeight } from './typography';

/** Approved inline choice row or single selector. The caller owns the service value. */
export function FilterChoices(props: {
  label: string;
  testID: string;
  /** `chips` shows every choice in a row; `select` opens one selector. */
  variant?: 'chips' | 'select';
  /** Control density of the chips and the selector trigger. */
  size?: ControlSize;
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
  // The server uses an empty string as a legal option ID, so a chosen value always names itself;
  // the "全部…" wording only covers a value that no current item matches.
  const chosen = () => props.items.some((item) => item.value === props.value);
  const title = () => props.items.find((item) => item.value === props.value)?.title ?? '';
  return (
    <If
      when={props.variant === 'select'}
      else={
        <View class="flex-row items-start" style={{ gap: space('lg') }}>
          <View style={{ width: space('2xl'), paddingTop: space('xs') }}>
            <Text
              style={{
                fontSize: textSize('meta'),
                fontWeight: textWeight('meta'),
                color: token('muted-foreground'),
              }}
            >
              {props.label}
            </Text>
          </View>
          {/* Room for the chip's focus ring: outline-2 plus offset-4 on both sides. */}
          <Scroll horizontal class="flex-1" style={{ height: space('2xl') + 16 }}>
            <CardControls
              label={props.label}
              onNavigate={props.onNavigate}
              gap={space('xs')}
              class="flex-nowrap"
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
                      size={props.size ?? 'sm'}
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
              // An empty value is the cleared filter, so its label must still name the dimension:
              // two triggers both reading "全部" leave a remote viewer unable to tell them apart.
              props.value === '' || !chosen()
                ? props.label === '排序'
                  ? '综合排序'
                  : `全部${props.label}`
                : title()
            }
            selectOpen={open()}
            dropdown
            onPress={() => open.set(true)}
          />
        }
        popupClass="bg-popover border border-border"
        popupStyle={{ padding: space('xs'), borderRadius: radius('xl'), borderWidth: border }}
        itemClass={selectItemClass()}
        itemStyle={{
          paddingHorizontal: space('sm'),
          paddingVertical: space('xs'),
          borderRadius: radius('lg'),
          fontSize: textSize('body'),
          lineHeight: selectItemLineHeight(textSize('body')),
        }}
        renderItem={(entry) => <SelectItemLabel entry={entry} />}
      />
    </If>
  );
}
