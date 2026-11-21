import { View, windowSize } from 'nsh';
import { Cover, SkeletonBlock, SkeletonRegion, UiText, type ProductTarget } from '@hongguo/ui';

/**
 * The draft's hero geometry (`assets/theater.css` `.rank-hero`): a 108° dark-red gradient band
 * with the copy vertically centred and a single rotated poster on the trailing edge. Below 1000
 * of window height the band keeps its width and identity but gives up height, so the checked
 * 1180×780 size still shows entries instead of only the header.
 */
function heroMetrics(target: ProductTarget) {
  return target === 'tv'
    ? {
        // The 540dp TV window spends 66 on the header and 37.5 on the help line; the hero keeps
        // the ranking name and its poster in 112dp so two entries still clear the first screen.
        minHeight: 112,
        padding: 16,
        copyGap: 6,
        artRight: 16,
        artWidth: 80,
        coverWidth: 62,
        coverHeight: 86,
        coverRadius: 8,
        radius: 8,
      }
    : windowSize().height < 1000
      ? {
          minHeight: 180,
          padding: 24,
          copyGap: 10,
          artRight: 24,
          artWidth: 240,
          coverWidth: 124,
          coverHeight: 170,
          coverRadius: 8,
          radius: 12,
        }
      : {
          minHeight: 236,
          padding: 36,
          copyGap: 12,
          artRight: 32,
          artWidth: 300,
          coverWidth: 154,
          coverHeight: 212,
          coverRadius: 8,
          radius: 12,
        };
}

/**
 * Rank header following the desktop draft: the approved dark-red gradient carries the current
 * ranking name and one rotated cover. Text uses the shared cinema tone so both themes read it.
 * The copy sits on the band's centre line, as the draft centres it, rather than hugging the top.
 */
export function RankingsHero(props: {
  target: ProductTarget;
  title: string;
  cover?: string;
  coverTitle?: string;
  /** Board-specific context; never a caption shared by every board. */
  subtitle?: string;
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
        class="flex-1 justify-center"
        style={{
          minHeight: metrics().minHeight,
          padding: metrics().padding,
          paddingRight: metrics().artWidth + metrics().padding,
          gap: metrics().copyGap,
        }}
      >
        {/* The ranking name is the page's one level-1 heading on every surface. */}
        <UiText role="page" tone="cinema">
          {props.title}
        </UiText>
        {/* The ranking name is the band's whole message; a caption repeated under every board
            said nothing about the one on screen. */}
        <If when={props.subtitle}>
          <UiText role="meta" tone="cinema" lines={2}>
            {props.subtitle}
          </UiText>
        </If>
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
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: metrics().coverWidth,
              height: metrics().coverHeight,
              rotate: '3deg',
              borderRadius: metrics().coverRadius,
              overflow: 'hidden',
            }}
          >
            <Cover
              src={props.cover}
              title={props.coverTitle ?? props.title}
              height={metrics().coverHeight}
              class="w-full"
            />
          </View>
        </View>
      </If>
    </View>
  );
}

/**
 * The hero skeleton sits on the fixed gradient, where the shared `skeleton` tone is a light-grey
 * block in light mode and nearly invisible in dark mode. A translucent light wash reads on both
 * because it takes its contrast from the band itself, not from the page surface.
 */
const HERO_SKELETON = 'opacity-25';

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
          class="flex-1 justify-center"
          style={{
            padding: metrics().padding,
            paddingRight: metrics().artWidth + metrics().padding,
            gap: metrics().copyGap,
          }}
        >
          <SkeletonBlock
            width={props.target === 'tv' ? 210 : 280}
            height={props.target === 'tv' ? 33 : 44}
            class={HERO_SKELETON}
          />
          {/* No second bar: the real hero draws one heading line, so a caption placeholder would
              make the title jump vertically when the board arrives. */}
        </View>
        <View
          style={{
            position: 'absolute',
            right: metrics().artRight,
            top: 0,
            bottom: 0,
            width: metrics().artWidth,
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <SkeletonBlock
            width={metrics().coverWidth}
            height={metrics().coverHeight}
            radius={metrics().coverRadius}
            class={HERO_SKELETON}
          />
        </View>
      </View>
    </SkeletonRegion>
  );
}
