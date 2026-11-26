import { nativeComponent, platform } from 'nsh';

const NativeScope = nativeComponent<{ cinema: boolean }>('hongguo.tv.remote-scope', {
  props: ['cinema'],
});

/** Registers a native modal window with the embedding host's remote adapter. Other hosts render nothing. */
export function RemoteFocusScope(props: { cinema?: boolean }) {
  return (
    <If when={platform.os === 'android'}>
      <NativeScope
        cinema={!!props.cinema}
        accessibilityElementsHidden
        style={{ position: 'absolute', width: 0, height: 0 }}
      />
    </If>
  );
}
