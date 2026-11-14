import { Image, Text, View, type ImageAsset } from 'nsh';
import { Product, tvUnit } from './foundation';

/** The caller supplies the approved brand bitmap; its accessible name stays stable. */
export function Logo(props: { mark: ImageAsset; class?: string }) {
  return (
    <View accessibilityLabel="红果短剧" class={`flex-row items-center gap-2 ${props.class ?? ''}`}>
      <Image
        src={props.mark}
        style={{
          width: Product() === 'tv' ? tvUnit(32) : 28,
          height: Product() === 'tv' ? tvUnit(32) : 28,
        }}
      />
      <Text
        style={{ fontSize: Product() === 'tv' ? tvUnit(32) : 26 }}
        class="font-semibold text-foreground"
      >
        红果短剧
      </Text>
    </View>
  );
}
