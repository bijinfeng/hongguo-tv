import { View } from 'nsh';
import {
  Cover,
  SkeletonBlock,
  SkeletonRegion,
  UiText,
  tvUnit,
  type ProductTarget,
} from '@hongguo/ui';

/** Copy from the desktop draft; the product only lists public catalog titles. */
const HERO_DESCRIPTION = '每日更新，按公开目录整理当前值得看的短剧。';

function heroMetrics(target: ProductTarget) {
  return target === 'tv'
    ? {
        minHeight: tvUnit(260),
        padding: tvUnit(24),
        copyGap: tvUnit(16),
        copyMax: tvUnit(1100),
        artRight: tvUnit(24),
        artWidth: tvUnit(170),
        coverWidth: tvUnit(112),
        coverHeight: tvUnit(154),
        radius: tvUnit(12),
      }
    : {
        minHeight: 236,
        padding: 36,
        copyGap: 12,
        copyMax: 540,
        artRight: 32,
        artWidth: 300,
        coverWidth: 154,
        coverHeight: 212,
        radius: 12,
      };
}

/**
 * Rank header following the desktop draft (`assets/theater.css` `.rank-hero`): the approved
 * dark-red gradient carries the current ranking name and a single rotated cover. The draft's
 * decorative shadow stays out; text uses the shared cinema tone so both themes read it.
 */
export function RankingsHero(props: {
  target: ProductTarget;
  title: string;
  cover?: string;
  coverTitle?: string;
}) {
  const metrics = () => heroMetrics(props.target);
  return (
    <View
      testID="ranking-hero"
      class="shrink-0 overflow-hidden"
      style={{
        position: 'relative',
        minHeight: metrics().minHeight,
        borderRadius: metrics().radius,
        backgroundImage: 'linear-gradient(108deg, #5c120d 0%, #8f2417 55%, #3b1311 100%)',
      }}
    >
      <View
        style={{
          padding: metrics().padding,
          paddingRight: metrics().artWidth,
          maxWidth: metrics().copyMax + metrics().padding * 2 + metrics().artWidth,
          gap: metrics().copyGap,
        }}
      >
        <UiText role="page" tone="cinema">
          {props.title}
        </UiText>
        <UiText role="body" tone="cinema" lines={2}>
          {HERO_DESCRIPTION}
        </UiText>
      </View>
      <If when={props.cover}>
        <View
          accessibilityElementsHidden
          style={{
            position: 'absolute',
            right: metrics().artRight,
            top: 0,
            bottom: 0,
            width: metrics().artWidth,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: metrics().coverWidth, rotate: '3deg' }}>
            <Cover
              src={props.cover}
              title={props.coverTitle ?? props.title}
              height={metrics().coverHeight}
            />
          </View>
        </View>
      </If>
    </View>
  );
}

/** First-paint shape of the hero; static skeleton without entrance motion. */
export function RankingsHeroSkeleton(props: { target: ProductTarget }) {
  const metrics = () => heroMetrics(props.target);
  return (
    <SkeletonRegion
      label="正在加载榜单"
      testID="ranking-hero-pending"
      class="shrink-0 overflow-hidden"
      style={{
        position: 'relative',
        minHeight: metrics().minHeight,
        borderRadius: metrics().radius,
        backgroundImage: 'linear-gradient(108deg, #5c120d 0%, #8f2417 55%, #3b1311 100%)',
      }}
    >
      <View style={{ flex: 1, position: 'relative' }}>
        <View
          style={{
            padding: metrics().padding,
            paddingRight: metrics().artWidth,
            maxWidth: metrics().copyMax + metrics().padding * 2 + metrics().artWidth,
            gap: metrics().copyGap,
          }}
        >
          <SkeletonBlock
            width={props.target === 'tv' ? tvUnit(420) : 280}
            height={props.target === 'tv' ? tvUnit(66) : 44}
          />
          <SkeletonBlock width="72%" height={props.target === 'tv' ? tvUnit(24) : 16} />
        </View>
        <View
          style={{
            position: 'absolute',
            right: metrics().artRight,
            top: 0,
            bottom: 0,
            width: metrics().artWidth,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SkeletonBlock width={metrics().coverWidth} height={metrics().coverHeight} radius={12} />
        </View>
      </View>
    </SkeletonRegion>
  );
}
