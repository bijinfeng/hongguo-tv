import { Image, Text, View, token, windowSize } from 'nsh';
import { Button, CardControls, SkeletonBlock, SkeletonRegion, UiText } from '@hongguo/ui';
import type { Drama } from '@hongguo/core-client';
import type { Store } from '../../store';

/**
 * Hero geometry from the desktop draft (`assets/theater.css`): 5fr/7fr at 355px,
 * a wider copy column at 330px under 1190, and a taller 410px hero from 1600.
 */
function desktopHero() {
  const width = windowSize().width;
  if (width >= 1600) return { minHeight: 410, poster: 205, back: 178, shift: -126, padLeft: 46 };
  if (width <= 1190) return { minHeight: 330, poster: 145, back: 124, shift: -80, padLeft: 26 };
  return { minHeight: 355, poster: 170, back: 143, shift: -109, padLeft: 36 };
}

/** Draft hero word: `clamp(110px, 14vw, 215px)` on desktop, 330 units on TV. */
const desktopWordSize = () => Math.min(215, Math.max(110, windowSize().width * 0.14));

function Poster(props: {
  drama?: Drama;
  width: number;
  shift: number;
  offsetY: number;
  rotate: string;
  opacity?: number;
  shadow?: string;
}) {
  const source = () => props.drama?.cover_fallback || props.drama?.cover;
  if (!source()) return null;
  return (
    <Image
      src={source()}
      class="object-cover"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: props.width,
        height: props.width * 1.5,
        marginLeft: -props.width / 2 + props.shift,
        marginTop: -(props.width * 1.5) / 2 + props.offsetY,
        borderRadius: 3,
        opacity: props.opacity,
        rotate: props.rotate,
        boxShadow: props.shadow,
      }}
    />
  );
}

/**
 * Hero art as the draft composes it: stacked posters over a scored column word,
 * with the panel fading out of the card surface on the left.
 */
function DesktopArt(props: { drama: Drama; second?: Drama }) {
  const word = () => Array.from(props.drama.title)[0] ?? '';
  const size = () => desktopHero();
  return (
    <View
      accessibilityElementsHidden
      style={{
        flex: 7,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: `linear-gradient(90deg, ${token('card')}, transparent 55%), radial-gradient(ellipse at 65% 75%, rgba(250, 119, 5, 0.2), transparent 65%), linear-gradient(140deg, #242525, #0d0e0e)`,
      }}
    >
      <Text
        style={{
          position: 'absolute',
          right: '9%',
          top: 0,
          fontSize: desktopWordSize(),
          lineHeight: desktopWordSize() * 1.4,
          letterSpacing: desktopWordSize() * 0.1,
          fontWeight: 'normal',
          color: 'rgba(255, 255, 255, 0.07)',
        }}
      >
        {word()}
      </Text>
      <Poster
        drama={props.second}
        width={size().back}
        shift={size().shift}
        offsetY={5}
        rotate="-10deg"
        opacity={0.8}
      />
      <Poster
        drama={props.drama}
        width={size().poster}
        shift={12}
        offsetY={0}
        rotate="8deg"
        shadow="12px 18px 35px rgba(0, 0, 0, 0.42)"
      />
    </View>
  );
}

/** TV hero art: a wide glow that bleeds past the content column, as the TV draft sets it. */
function TvArt(props: { drama: Drama; second?: Drama }) {
  const word = () => Array.from(props.drama.title)[0] ?? '';
  return (
    <View
      accessibilityElementsHidden
      style={{
        position: 'absolute',
        right: -44,
        top: -18,
        width: 520,
        height: 260,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage:
          'radial-gradient(ellipse at 70% 40%, rgba(250, 119, 5, 0.2), transparent 67%)',
      }}
    >
      <Text
        style={{
          position: 'absolute',
          right: 75,
          top: -7.5,
          fontSize: 165,
          lineHeight: 165 * 1.4,
          letterSpacing: 165 * 0.1,
          fontWeight: 'normal',
          color: 'rgba(255, 255, 255, 0.07)',
        }}
      >
        {word()}
      </Text>
      <Poster
        drama={props.second}
        width={119}
        shift={-42.5}
        offsetY={2.5}
        rotate="-10deg"
        opacity={0.8}
      />
      <Poster
        drama={props.drama}
        width={137.5}
        shift={62.5}
        offsetY={-2.5}
        rotate="8deg"
        shadow="12px 18px 35px rgba(0, 0, 0, 0.42)"
      />
    </View>
  );
}

/**
 * Pending hero: the card, copy column and art panel keep the loaded geometry, so the
 * featured drama lands without a reflow. Same announcement as the grid region.
 */
function HeroSkeleton(props: { tv: boolean }) {
  const size = () => desktopHero();
  return (
    <SkeletonRegion
      label="正在加载精选内容"
      testID="home-hero-pending"
      class={`overflow-hidden rounded-(--radius) bg-card ${props.tv ? '' : 'flex-row'}`}
      style={{
        minHeight: props.tv ? 225 : size().minHeight,
        marginBottom: props.tv ? 12 : 0,
        flexDirection: props.tv ? 'column' : 'row',
        alignItems: props.tv ? 'flex-start' : 'stretch',
        justifyContent: props.tv ? 'center' : undefined,
      }}
    >
      <View
        class="justify-center"
        style={
          props.tv
            ? { width: 395, paddingBottom: 4, gap: 9 }
            : { flex: 5, paddingTop: 36, paddingBottom: 36, paddingLeft: size().padLeft, gap: 12 }
        }
      >
        <SkeletonBlock
          width={props.tv ? 70 : 108}
          height={props.tv ? 10 : 12}
          radius={props.tv ? 5 : 6}
        />
        <SkeletonBlock width="62%" height={props.tv ? 26 : 44} radius={props.tv ? 4 : 6} />
        <SkeletonBlock width="82%" height={props.tv ? 10 : 12} radius={4} />
        <View class="flex-row" style={{ gap: props.tv ? 9 : 12 }}>
          <SkeletonBlock
            width={props.tv ? 110 : 140}
            height={props.tv ? 31 : 44}
            radius={props.tv ? 6 : 8}
          />
          <SkeletonBlock
            width={props.tv ? 84 : 104}
            height={props.tv ? 31 : 44}
            radius={props.tv ? 6 : 8}
          />
        </View>
      </View>
      <If when={!props.tv}>
        {/* The loaded hero's art panel fades out of the card on its leading edge, so the skeleton
            follows the same ramp instead of butting a grey block against the white copy column: the
            card's own surface holds the copy, and the art panel deepens toward its trailing edge. */}
        <View
          accessibilityElementsHidden
          class="items-center justify-center"
          style={{
            flex: 7,
            // Same left-to-right ramp as the loaded panel: the card surface carries the join with
            // the copy column, and the panel deepens toward the poster it will hold.
            backgroundImage: `linear-gradient(90deg, ${token('card')} 0%, ${token('skeleton-surface')} 38%, ${token('skeleton')} 100%)`,
          }}
        >
          <SkeletonBlock width={size().poster} height={size().poster * 1.5} radius={3} />
        </View>
      </If>
    </SkeletonRegion>
  );
}

/** Featured drama from the home catalog: draft copy/art pair with the resume-aware primary action. */
export function HomeHero(props: { store: Store }) {
  const tv = () => props.store.target === 'tv';
  const catalog = props.store.homeCatalog;
  const items = () => catalog.data()?.items ?? [];
  const featured = () => items()[0];
  const second = () => items()[1];
  /** No data yet and no failure: the only state that owns a hero skeleton. */
  const unresolved = () => catalog.data() === undefined && !catalog.error();
  const resume = () => {
    const drama = featured();
    return drama ? props.store.resume(drama) : undefined;
  };
  const watchLabel = () => {
    const entry = resume();
    return entry?.episode ? `继续第 ${entry.episode} 集` : '立即观看';
  };
  const meta = () => {
    const drama = featured();
    if (!drama) return '红果精选';
    const kind = drama.tags?.slice(0, 2).join(' · ');
    const count = drama.episode_count ? `全 ${drama.episode_count} 集` : '';
    return [kind, count].filter(Boolean).join(' · ');
  };
  // The intro is body copy, not fine print: the shared meta role sets its size on both hosts.
  const introWidth = () => (tv() ? 322 : 392);
  const copyStyle = () => {
    return tv()
      ? { width: 395, paddingBottom: 4 }
      : { flex: 5, paddingTop: 36, paddingBottom: 36, paddingLeft: desktopHero().padLeft };
  };
  return (
    <If
      when={featured()}
      else={
        <If when={unresolved()}>
          <HeroSkeleton tv={tv()} />
        </If>
      }
    >
      {(drama) => (
        <View
          class="overflow-hidden rounded-(--radius) bg-card"
          style={{
            position: 'relative',
            flexDirection: tv() ? 'column' : 'row',
            alignItems: tv() ? 'flex-start' : 'stretch',
            justifyContent: tv() ? 'center' : undefined,
            minHeight: tv() ? 225 : desktopHero().minHeight,
            marginBottom: tv() ? 12 : 0,
          }}
        >
          <View class="justify-center" style={{ ...copyStyle(), position: 'relative', zIndex: 1 }}>
            <View style={{ marginBottom: tv() ? 5 : 9 }}>
              <UiText role="meta">{meta()}</UiText>
            </View>
            <View style={{ marginBottom: tv() ? 16.5 : 25 }}>
              <UiText role="display" lines={2}>
                {drama().title}
              </UiText>
            </View>
            <If when={drama().intro}>
              <View style={{ marginBottom: tv() ? 15.5 : 25, maxWidth: introWidth() }}>
                <UiText role="meta" lines={2}>
                  {drama().intro}
                </UiText>
              </View>
            </If>
            <CardControls label="精选" onNavigate={props.store.noteFocusIntent} gap={tv() ? 9 : 12}>
              <Button
                variant="primary"
                icon="play"
                label={watchLabel()}
                testID="home-hero-watch"
                onPress={() => props.store.watch(drama(), () => props.store.restoreFocus())}
              />
              <Button
                variant="quiet"
                label="查看详情"
                icon="arrow-up-right"
                testID="home-hero-detail"
                onPress={() => props.store.open(drama(), () => props.store.restoreFocus())}
              />
            </CardControls>
          </View>
          <If when={tv()} else={<DesktopArt drama={drama()} second={second()} />}>
            <TvArt drama={drama()} second={second()} />
          </If>
        </View>
      )}
    </If>
  );
}
