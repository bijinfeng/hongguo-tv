import { Image, Text, token, View, type ImageAsset } from 'nsh';
import { space } from './foundation';
import { textWeight } from './typography';

/** The lockup keeps its own optical sizes: the mark is a bitmap, the wordmark a fixed line. */
const MARK_SIZE = 28;
const MARK_SIZE_COMPACT = 24;
const WORDMARK_SIZE = 26;
const WORDMARK_SIZE_COMPACT = 22;

/** The caller supplies the approved brand bitmap; its accessible name stays stable. */
export function Logo(props: { mark: ImageAsset; class?: string; size?: 'default' | 'compact' }) {
  const compact = () => props.size === 'compact';
  return (
    <View
      accessibilityLabel="红果短剧"
      class={`flex-row items-center ${props.class ?? ''}`}
      style={{ gap: compact() ? space('xxs') : space('xs') }}
    >
      <Image
        src={props.mark}
        style={{
          width: compact() ? MARK_SIZE_COMPACT : MARK_SIZE,
          height: compact() ? MARK_SIZE_COMPACT : MARK_SIZE,
        }}
      />
      <Text
        style={{
          fontSize: compact() ? WORDMARK_SIZE_COMPACT : WORDMARK_SIZE,
          fontWeight: textWeight('title'),
          color: token('foreground'),
        }}
      >
        红果短剧
      </Text>
    </View>
  );
}
