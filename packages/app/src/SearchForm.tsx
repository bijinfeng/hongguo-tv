import { View, type InputRef } from 'nsh';
import { Button, Icon, SearchInput } from '@hongguo/ui';
import type { Store } from './store';

export function SearchForm(props: { store: Store }) {
  let input: InputRef | undefined;
  const submit = () => {
    props.store.submit();
    input?.blur();
  };
  return (
    <View
      class={
        props.store.target === 'desktop'
          ? 'flex-row items-center gap-2 rounded-(--radius) bg-muted pl-4 pr-1 h-12'
          : 'flex-row gap-3'
      }
    >
      <If when={props.store.target === 'desktop'}>
        <Icon name="search" />
      </If>
      <SearchInput
        embedded={props.store.target === 'desktop'}
        inputRef={(ref) => {
          input = ref;
          props.store.searchInputRef(ref);
        }}
        value={props.store.draft()}
        onChange={props.store.draft.set}
        onSubmit={submit}
      />
      <Button
        testID="search-submit"
        label="搜索"
        primary={props.store.target === 'tv'}
        variant={props.store.target === 'desktop' ? 'quiet' : undefined}
        compact={props.store.target === 'desktop'}
        disabled={!props.store.draft().trim()}
        onPress={submit}
      />
    </View>
  );
}
