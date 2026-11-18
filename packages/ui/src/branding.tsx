import { Image, Text, View, type ImageAsset } from 'nsh';
import {} from './foundation';

/** The caller supplies the approved brand bitmap; its accessible name stays stable. */
export function Logo(props: { mark: ImageAsset; class?: string; size?: 'default' | 'compact' }) {
  const compact = () => props.size === 'compact';
  return (
    <View
      accessibilityLabel="红果短剧"
      class={`flex-row items-center ${props.class ?? ''}`}
      style={{ gap: compact() ? 6 : 8 }}
    >
      <Image
        src={props.mark}
        style={{
          width: compact() ? 24 : 28,
          height: compact() ? 24 : 28,
        }}
      />
      <Text style={{ fontSize: compact() ? 22 : 26 }} class="font-semibold text-foreground">
        红果短剧
      </Text>
    </View>
  );
}
