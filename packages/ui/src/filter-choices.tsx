import { signal, effect, type ViewRef } from 'nsh';
import { Select } from 'nsh/base';
import { registerModalPopup } from './modal-dismiss';
import { Button } from './button';
import { selectItemClass, SelectItemLabel, selectItemLineHeight } from './select';
import { LabeledChoiceList } from './choice-list';
import { border, radius, space } from './foundation';
import { textSize } from './typography';

/** Approved inline choice row or single selector. The caller owns the service value. */
export function FilterChoices(props: {
  label: string;
  testID: string;
  /** `chips` shows every choice in a row; `select` opens one selector. */
  variant?: 'chips' | 'select';
  value: string;
  items: { value: string; title: string }[];
  onChange: (value: string) => void;
  active: boolean;
  onSource?: (restore: () => void) => void;
  onNavigate?: () => void;
}) {
  const open = signal(false);
  registerModalPopup(open, () => open.set(false));
  let trigger: ViewRef | undefined;
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
        <LabeledChoiceList
          title={props.label}
          label={props.label}
          value={props.value}
          items={props.items}
          onChange={props.onChange}
          testID={props.testID}
          onSource={props.onSource}
          onNavigate={props.onNavigate}
        />
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
