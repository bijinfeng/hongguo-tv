import { View, Text, signal, effect, cleanup, keymap, type InputRef, type ViewRef } from 'nsh';
import { Button, Icon, SearchInput, SearchPicker, SearchSuggestionRow, tvUnit } from '@hongguo/ui';
import type { SearchSuggestion } from '@hongguo/core-client';
import { suggestionAction, suggestionIdentity } from './search-suggestions';
import type { Store } from './store';

export function SearchForm(props: { store: Store }) {
  const suggestions = props.store.suggestions;
  const focused = signal(false);
  const editing = signal(false);
  let keepDismissed = false;
  const width = signal(520);
  const rows = new Map<string, ViewRef>();
  let input: InputRef | undefined;
  let anchor: ViewRef | undefined;
  let blurFrame = 0;
  let frame = 0;
  let disposed = false;
  const ownFocus = () => {
    cancelAnimationFrame(blurFrame);
    focused.set(true);
  };
  const blur = () => {
    if (props.store.hostOwnsFocus) return;
    focused.set(false);
    editing.set(false);
    cancelAnimationFrame(blurFrame);
    blurFrame = requestAnimationFrame(() => {
      if (!focused()) {
        keepDismissed = false;
        suggestions.dismiss();
      }
    });
  };
  const dismiss = () => {
    cancelAnimationFrame(blurFrame);
    suggestions.dismiss();
  };
  const inputFocus = () => {
    ownFocus();
    editing.set(true);
    if (!keepDismissed && !props.store.searchError()) suggestions.focus();
    keepDismissed = false;
  };
  const focusInput = () => {
    ownFocus();
    editing.set(true);
    input?.focus();
    suggestions.focus();
  };
  cleanup(() => {
    disposed = true;
    cancelAnimationFrame(blurFrame);
    cancelAnimationFrame(frame);
  });
  const submit = () => {
    if (props.store.submit()) input?.blur();
  };
  effect(() => {
    if (!editing() || suggestions.composing()) return;
    const unbind = keymap.bind(
      'down',
      () => {
        props.store.noteFocusIntent();
        if (suggestions.open() && suggestions.error()) {
          rows.get('retry')?.focus();
          return;
        }
        const first = suggestions.items()[0];
        if (suggestions.open() && first) rows.get(suggestionIdentity(first))?.focus();
      },
      { when: 'always' },
    );
    // A row's CardControls binds later and owns its own arrows.
    cleanup(unbind);
  });
  effect(() => {
    if (!suggestions.open() || suggestions.composing()) return;
    const unbind = keymap.bind(
      {
        tab: () => {
          props.store.noteFocusIntent();
          dismiss();
        },
        'shift+tab': () => {
          props.store.noteFocusIntent();
          dismiss();
        },
      },
      { when: 'always', passThrough: true },
    );
    cleanup(unbind);
  });
  effect(() => {
    const id = props.store.hostFocus();
    if (!id) return;
    if (id === 'search-input' || id.startsWith('suggestion-') || id === 'suggestions-retry') {
      ownFocus();
      editing.set(id === 'search-input');
    } else {
      keepDismissed = false;
      focused.set(false);
      editing.set(false);
      dismiss();
    }
  });
  const activate = (item: SearchSuggestion) => {
    if (!suggestions.owns(item)) return;
    const raw = props.store.draft();
    const restore = () => {
      if (disposed || props.store.draft() !== raw) return;
      focusInput();
      const ownsFocus = props.store.focusGuard();
      frame = requestAnimationFrame(() => {
        if (!disposed && ownsFocus() && props.store.draft() === raw && suggestions.open())
          rows.get(suggestionIdentity(item))?.focus();
      });
    };
    const action = suggestionAction(item);
    if (action !== 'query') input?.blur();
    if (action === 'actor') props.store.openActor(item.actor_id!, item.name, restore);
    else if (action === 'drama') props.store.open(item.drama!, restore);
    else {
      dismiss();
      props.store.draft.set(item.name);
      submit();
    }
  };
  return (
    <View class="gap-2">
      <View
        ref={(ref) => {
          anchor = ref;
        }}
        onLayout={({ bounds }) => {
          if (bounds.size.width) width.set(bounds.size.width);
        }}
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
          onChange={(value) => {
            keepDismissed = false;
            props.store.draft.set(value);
            suggestions.focus();
          }}
          onSubmit={submit}
          onFocus={inputFocus}
          onBlur={blur}
          onCompositionChange={({ composing }) => suggestions.composition(composing)}
          expanded={suggestions.open()}
          invalid={!!props.store.searchError()}
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
      <If when={props.store.searchError()}>
        <Text
          testID="search-validation"
          class="text-sm text-destructive"
          style={props.store.target === 'tv' ? { fontSize: tvUnit(24) } : undefined}
        >
          {props.store.searchError()}
        </Text>
      </If>
      <If when={suggestions.open()}>
        <SearchPicker
          onNavigate={props.store.noteFocusIntent}
          anchor={anchor}
          width={width()}
          onDismiss={dismiss}
          onCancel={() => {
            keepDismissed = true;
            dismiss();
            input?.focus();
          }}
          onInput={focusInput}
        >
          <If when={suggestions.loading()}>
            <Text class="px-3 py-2 text-sm text-muted-foreground">正在加载建议…</Text>
          </If>
          <If when={suggestions.error()}>
            <Text class="px-3 py-2 text-sm text-muted-foreground">建议未能加载</Text>
            <SearchSuggestionRow
              label="重试"
              icon="search"
              testID="suggestions-retry"
              rowRef={(ref) => rows.set('retry', ref)}
              onFocus={ownFocus}
              onBlur={blur}
              onPress={() => {
                focusInput();
                suggestions.retry();
              }}
            />
          </If>
          <If when={!suggestions.loading() && !suggestions.error() && !suggestions.items().length}>
            <Text class="px-3 py-2 text-sm text-muted-foreground">暂无建议，可直接搜索</Text>
          </If>
          <Each of={suggestions.items()} key={suggestionIdentity}>
            {(item) => {
              const identity = suggestionIdentity(item());
              cleanup(() => rows.delete(identity));
              return (
                <SearchSuggestionRow
                  label={item().name}
                  meta={item().meta}
                  icon={
                    suggestionAction(item()) === 'actor'
                      ? 'user'
                      : suggestionAction(item()) === 'drama'
                        ? 'play'
                        : 'search'
                  }
                  testID={`suggestion-${identity}`}
                  rowRef={(ref) => rows.set(identity, ref)}
                  onFocus={ownFocus}
                  onBlur={blur}
                  onPress={() => activate(item())}
                />
              );
            }}
          </Each>
        </SearchPicker>
      </If>
    </View>
  );
}
