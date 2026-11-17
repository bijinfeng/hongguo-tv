import { Image, Text, View, token, windowSize } from 'nsh';
import { Button, CardControls, SkeletonBlock, SkeletonRegion, UiText, tvUnit } from '@hongguo/ui';
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
        right: -tvUnit(88),
        top: -tvUnit(36),
        width: tvUnit(1040),
        height: tvUnit(520),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage:
          'radial-gradient(ellipse at 70% 40%, rgba(250, 119, 5, 0.2), transparent 67%)',
      }}
    >
      <Text
        style={{
          position: 'absolute',
          right: tvUnit(150),
          top: -tvUnit(15),
          fontSize: tvUnit(330),
          lineHeight: tvUnit(330) * 1.4,
          letterSpacing: tvUnit(330) * 0.1,
          fontWeight: 'normal',
          color: 'rgba(255, 255, 255, 0.07)',
        }}
      >
        {word()}
      </Text>
      <Poster
        drama={props.second}
        width={tvUnit(238)}
        shift={-tvUnit(85)}
        offsetY={tvUnit(5)}
        rotate="-10deg"
        opacity={0.8}
      />
      <Poster
        drama={props.drama}
        width={tvUnit(275)}
        shift={tvUnit(125)}
        offsetY={-tvUnit(5)}
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
        minHeight: props.tv ? tvUnit(450) : size().minHeight,
        marginBottom: props.tv ? tvUnit(24) : 0,
        flexDirection: props.tv ? 'column' : 'row',
        alignItems: props.tv ? 'flex-start' : 'stretch',
        justifyContent: props.tv ? 'center' : undefined,
      }}
    >
      <View
        class="justify-center"
        style={
          props.tv
            ? { width: tvUnit(790), paddingBottom: tvUnit(8), gap: tvUnit(18) }
            : { flex: 5, paddingTop: 36, paddingBottom: 36, paddingLeft: size().padLeft, gap: 12 }
        }
      >
        <SkeletonBlock
          width={props.tv ? tvUnit(140) : 108}
          height={props.tv ? tvUnit(20) : 12}
          radius={props.tv ? tvUnit(10) : 6}
        />
        <SkeletonBlock
          width="62%"
          height={props.tv ? tvUnit(52) : 44}
          radius={props.tv ? tvUnit(8) : 6}
        />
        <SkeletonBlock width="82%" height={props.tv ? tvUnit(20) : 12} radius={4} />
        <View class="flex-row" style={{ gap: props.tv ? tvUnit(18) : 12 }}>
          <SkeletonBlock
            width={props.tv ? tvUnit(220) : 140}
            height={props.tv ? tvUnit(62) : 44}
            radius={props.tv ? tvUnit(12) : 8}
          />
          <SkeletonBlock
            width={props.tv ? tvUnit(168) : 104}
            height={props.tv ? tvUnit(62) : 44}
            radius={props.tv ? tvUnit(12) : 8}
          />
        </View>
      </View>
      <If when={!props.tv}>
        <View
          accessibilityElementsHidden
          class="items-center justify-center bg-skeleton-surface"
          style={{ flex: 7 }}
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
  const introStyle = () =>
    tv()
      ? { fontSize: tvUnit(23), lineHeight: tvUnit(23) * 1.85, maxWidth: tvUnit(644) }
      : { fontSize: 14, lineHeight: 14 * 1.85, maxWidth: 392 };
  const copyStyle = () => {
    return tv()
      ? { width: tvUnit(790), paddingBottom: tvUnit(8) }
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
            minHeight: tv() ? tvUnit(450) : desktopHero().minHeight,
            marginBottom: tv() ? tvUnit(24) : 0,
          }}
        >
          <View class="justify-center" style={{ ...copyStyle(), position: 'relative', zIndex: 1 }}>
            <View style={{ marginBottom: tv() ? tvUnit(10) : 9 }}>
              <UiText role="meta">{meta()}</UiText>
            </View>
            <View style={{ marginBottom: tv() ? tvUnit(33) : 25 }}>
              <UiText role="display" lines={2}>
                {drama().title}
              </UiText>
            </View>
            <If when={drama().intro}>
              <View style={{ marginBottom: tv() ? tvUnit(31) : 25 }}>
                <Text class="text-muted-foreground" style={{ ...introStyle(), numberOfLines: 2 }}>
                  {drama().intro}
                </Text>
              </View>
            </If>
            <CardControls
              label="精选"
              onNavigate={props.store.noteFocusIntent}
              gap={tv() ? tvUnit(18) : 12}
            >
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
