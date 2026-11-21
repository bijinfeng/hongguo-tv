import {
  Text,
  View,
  createMotion,
  effect,
  reduceMotion,
  signal,
  token,
  type ImageAsset,
  type JSX,
  type ViewProps,
} from 'nsh';
import { Avatar as BaseAvatar, Progress as BaseProgress } from 'nsh/base';
import { Button } from './button';
import { border, controlMetrics, radius, space } from './foundation';
import { Icon, type IconName } from './icon';

const BADGE_MIN_HEIGHT = 28;
const BADGE_PADDING_X = 10;
const BADGE_PADDING_Y = 3;
const BADGE_GAP = 6;
const INLINE_MIN_WIDTH = 360;
const INLINE_IMAGE_MIN_HEIGHT = 180;
const SLIDER_TRACK_HEIGHT = 6;
import {
  textLetterSpacing,
  textLineHeight,
  textSize,
  textWeight,
  type TextRole,
} from './typography';
export type { TextRole } from './typography';
/** Semantic foregrounds; consumers cannot supply fonts or colors. */
export type TextTone = 'default' | 'muted' | 'error' | 'selected' | 'cinema';
/** Shared text owns typography; callers own its content and surrounding layout. */
export interface UiTextProps {
  role?: TextRole;
  tone?: TextTone;
  children?: JSX.Element;
  lines?: number;
  selectable?: boolean;
  align?: 'start' | 'center' | 'end';
  testID?: string;
}

const textTone = (tone?: TextTone, role?: TextRole) =>
  tone === 'error'
    ? 'destructive'
    : tone === 'selected'
      ? 'accent-foreground'
      : tone === 'cinema'
        ? 'cinema-foreground'
        : tone === 'muted' || (!tone && role === 'meta')
          ? 'muted-foreground'
          : 'foreground';

/** Renders one shared text role, retaining system font scaling and native selection. */
export function UiText(props: UiTextProps) {
  return (
    <View selectable={props.selectable} class="min-w-0">
      <Text
        testID={props.testID}
        role={
          ['display', 'page', 'section', 'title'].includes(props.role ?? '') ? 'header' : undefined
        }
        accessibilityLevel={
          // Only `page` is a page heading. `display` is the featured title inside a hero, so it
          // sits one level below: a page must not expose two level-1 headings.
          props.role === 'page'
            ? 1
            : props.role === 'display'
              ? 2
              : props.role === 'section'
                ? 2
                : props.role === 'title'
                  ? 3
                  : undefined
        }
        style={{
          fontSize: textSize(props.role),
          lineHeight: textLineHeight(props.role),
          letterSpacing: textLetterSpacing(props.role),
          fontWeight: textWeight(props.role),
          numberOfLines: props.lines ?? 0,
          textAlign: props.align ?? 'start',
          color: token(textTone(props.tone, props.role)),
        }}
        class={`${props.role === 'numeric' ? 'tabular-nums' : ''} selection:bg-accent`}
      >
        {props.children}
      </Text>
    </View>
  );
}

/** Static containment only. Use ContentArrival separately when content enters. */
export interface SurfaceProps {
  variant?: 'content' | 'muted' | 'page' | 'cinema';
  children?: JSX.Element;
  /** Layout classes only; surface presentation comes from variant. */
  class?: string;
  testID?: string;
}

/** Groups content with the approved surface, inset and spacing, without an entrance. */
export function Surface(props: SurfaceProps) {
  return (
    <View
      testID={props.testID}
      style={{ padding: space('lg'), gap: space('sm'), borderRadius: radius('xl') }}
      class={`${props.variant === 'muted' ? 'bg-muted' : props.variant === 'page' ? 'bg-background border border-border' : props.variant === 'cinema' ? 'bg-cinema' : 'bg-card'} ${props.class ?? ''}`}
    >
      {props.children}
    </View>
  );
}

/** A short, noninteractive state label. */
export interface BadgeProps {
  label: string;
  tone?: 'neutral' | 'selected' | 'error';
  icon?: IconName;
  testID?: string;
}

/** Communicates a state with text as well as color; never acts as a selector. */
export function Badge(props: BadgeProps) {
  return (
    <View
      testID={props.testID}
      accessible
      accessibilityLabel={props.label}
      style={{
        minHeight: BADGE_MIN_HEIGHT,
        paddingHorizontal: BADGE_PADDING_X,
        paddingVertical: BADGE_PADDING_Y,
        gap: BADGE_GAP,
        borderRadius: radius('md'),
      }}
      class={`flex-row items-center self-start ${props.tone === 'selected' ? 'bg-accent' : 'bg-muted'}`}
    >
      <If when={props.icon}>
        <Icon
          name={props.icon!}
          color={token(
            props.tone === 'selected'
              ? 'accent-foreground'
              : props.tone === 'error'
                ? 'destructive'
                : 'muted-foreground',
          )}
        />
      </If>
      <UiText
        role="meta"
        tone={props.tone === 'selected' ? 'selected' : props.tone === 'error' ? 'error' : 'muted'}
      >
        {props.label}
      </UiText>
    </View>
  );
}

/** Native image loading owns fallback state; callers supply only identity and size. */
export interface AvatarProps {
  src?: string | ImageAsset;
  name: string;
  size?: 'md' | 'lg';
  /** Empty makes a picture beside its visible name decorative. */
  accessibilityLabel?: string;
  testID?: string;
}

/** Shows the picture, or stable initials while absent, loading or failed. */
export function Avatar(props: AvatarProps) {
  return (
    <BaseAvatar
      src={props.src}
      name={props.name}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      style={{
        width: controlMetrics().height + (props.size === 'lg' ? space('lg') : 0),
        height: controlMetrics().height + (props.size === 'lg' ? space('lg') : 0),
      }}
      class="rounded-full shrink-0 overflow-hidden"
      imageClass="rounded-full object-cover"
      fallbackClass="rounded-full bg-muted text-muted-foreground items-center justify-center"
      fallback={
        <Text
          class="text-muted-foreground"
          style={{ fontSize: textSize(props.size === 'lg' ? 'section' : 'body') }}
        >
          {props.name.slice(0, 1)}
        </Text>
      }
    />
  );
}

/** Decorative boundary, deliberately outside the keyboard focus sequence. */
export interface SeparatorProps {
  axis?: 'horizontal' | 'vertical';
  testID?: string;
}

/** Draws one boundary on its owner without creating another focus target. */
export function Separator(props: SeparatorProps) {
  return (
    <View
      testID={props.testID}
      accessibilityElementsHidden
      style={
        props.axis === 'vertical'
          ? { width: border, alignSelf: 'stretch' }
          : { height: border, alignSelf: 'stretch' }
      }
      class="bg-border shrink-0"
    />
  );
}

/** A real waiting indicator; omit label when adjacent status text already names it. */
export interface SpinnerProps {
  label?: string;
  testID?: string;
}

/** Spins natively only while mounted; reduced motion retains the static glyph and label. */
export function Spinner(props: SpinnerProps) {
  const motion = createMotion();
  effect(() => {
    if (reduceMotion()) motion.reset();
    else
      void motion.play({
        keyframes: { rotate: [0, 360] },
        duration: 900,
        easing: 'linear',
        iterations: 'infinite',
      });
    return () => motion.stop();
  });
  return (
    <View
      testID={props.testID}
      accessible={!!props.label}
      accessibilityLabel={props.label}
      accessibilityElementsHidden={!props.label}
      accessibilityState={{ busy: true }}
      style={motion.style}
      class="self-start"
    >
      <Icon name="loader-circle" color={token('muted-foreground')} />
    </View>
  );
}

/** Inline feedback retains the caller's result and its recovery action. */
export interface InlineStatusProps {
  message: string;
  status?: 'info' | 'loading' | 'success' | 'error';
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/** Displays a readable state beside the relevant object, with an optional explicit recovery. */
export function InlineStatus(props: InlineStatusProps) {
  return (
    <View
      testID={props.testID}
      style={{ minHeight: controlMetrics().height, gap: space('sm') }}
      class="flex-row flex-wrap items-center"
    >
      <If
        when={props.status === 'loading'}
        else={
          <If when={props.status === 'success' || props.status === 'error'}>
            <Icon
              name={props.status === 'error' ? 'circle-alert' : 'check'}
              color={token(props.status === 'error' ? 'destructive' : 'foreground')}
            />
          </If>
        }
      >
        <Spinner />
      </If>
      <Text
        android={{ accessibilityLiveRegion: 'polite' }}
        style={{ fontSize: textSize(), lineHeight: textSize() * 1.5 }}
        class={props.status === 'error' ? 'text-destructive' : 'text-foreground'}
      >
        {props.message}
      </Text>
      <If when={props.action}>
        <Button
          label={props.action!.label}
          onPress={() => props.action?.onPress()}
          variant="quiet"
        />
      </If>
    </View>
  );
}

/** Legacy message/retry props remain supported while callers adopt explicit title and detail. */
export interface NoticeProps {
  message: string;
  title?: string;
  error?: boolean;
  retry?: () => void;
  retryLabel?: string;
  testID?: string;
  /** `cinema` pairs the notice with the dark playback surface it sits on. */
  tone?: 'page' | 'cinema';
}

/** An in-place notice keeps error copy and retry together; it never animates on value changes. */
export function Notice(props: NoticeProps) {
  const width = signal(Infinity);
  const inline = () => width() >= INLINE_MIN_WIDTH;
  const cinema = () => props.tone === 'cinema';
  return (
    <View
      testID={props.testID}
      onLayout={({ bounds }) => {
        if (bounds.size.width > 0) width.set(bounds.size.width);
      }}
      style={{
        gap: space('md'),
        paddingHorizontal: space('lg'),
        paddingVertical: space('md'),
        borderRadius: radius('xl'),
      }}
      class={`${inline() ? 'flex-row items-center' : 'items-start'} shrink-0 w-full min-w-0 ${cinema() ? 'bg-cinema-control' : 'bg-muted'}`}
    >
      <If when={props.error}>
        <Icon name="circle-alert" color={token('destructive')} />
      </If>
      <View class={`${inline() ? 'flex-1' : 'w-full'} min-w-0`} style={{ gap: space('xxs') }}>
        <If when={props.title}>
          <UiText role="body" tone={cinema() ? 'cinema' : undefined}>
            {props.title}
          </UiText>
        </If>
        <Text
          android={{ accessibilityLiveRegion: 'polite' }}
          style={{
            fontSize: textSize(props.title ? 'meta' : 'body'),
            lineHeight: textLineHeight(props.title ? 'meta' : 'body'),
            fontWeight: textWeight(props.title ? 'meta' : 'body'),
          }}
          class={
            cinema()
              ? 'text-cinema-foreground'
              : props.error && !props.title
                ? 'text-destructive'
                : 'text-muted-foreground'
          }
        >
          {props.message}
        </Text>
      </View>
      <If when={props.retry}>
        <Button
          label={props.retryLabel ?? '重试'}
          onPress={() => props.retry?.()}
          variant={cinema() ? 'quiet' : undefined}
          class={cinema() ? 'border-cinema-track bg-cinema-control' : undefined}
        />
      </If>
    </View>
  );
}

/** A next step for an empty or failed region, without removing surrounding controls. */
export interface EmptyProps {
  title: string;
  description?: string;
  error?: boolean;
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/** Explains what is missing and, when available, offers one recovery action. */
export function Empty(props: EmptyProps) {
  return (
    <View
      testID={props.testID}
      style={{
        minHeight: INLINE_IMAGE_MIN_HEIGHT,
        paddingVertical: space('lg'),
        paddingHorizontal: space('md'),
        gap: space('sm'),
      }}
      class="items-center justify-center"
    >
      <If when={props.error}>
        <Icon name="circle-alert" color={token('muted-foreground')} />
      </If>
      <UiText role="body" align="center">
        {props.title}
      </UiText>
      <If when={props.description}>
        <UiText role="meta" align="center">
          {props.description}
        </UiText>
      </If>
      <If when={props.action}>
        <Button label={props.action!.label} onPress={() => props.action?.onPress()} />
      </If>
    </View>
  );
}

/** The shape of genuinely pending content; skeletons deliberately do not shimmer. */
export interface SkeletonProps {
  variant?: 'text' | 'result' | 'poster';
  label?: string;
  testID?: string;
}

/** Preserves the expected content geometry and exposes one loading announcement. */
export function Skeleton(props: SkeletonProps) {
  return (
    <View
      accessible
      accessibilityLabel={props.label ?? '正在加载内容'}
      accessibilityState={{ busy: true }}
      testID={props.testID}
      style={{ gap: space('md') }}
      class="flex-row items-center"
    >
      <If when={props.variant === 'poster'}>
        <View
          style={{ width: '100%', aspectRatio: 2 / 2.7, borderRadius: radius('xl') }}
          class="bg-skeleton"
        />
      </If>
      <If when={props.variant === 'result'}>
        <View
          style={{
            width: 72,
            height: 96,
            borderRadius: radius('xl'),
          }}
          class="bg-skeleton shrink-0"
        />
      </If>
      <If when={props.variant !== 'poster'}>
        <View class="flex-1" style={{ gap: space('md') }}>
          <Each of={['68%', '88%', '44%']}>
            {(width) => (
              <View
                style={{
                  width: width() as `${number}%`,
                  height: 14,
                  borderRadius: radius('md'),
                }}
                class="bg-skeleton"
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

/** One inert block; the caller supplies the geometry of the content it stands in for. */
export interface SkeletonBlockProps {
  /** Product units, or a percentage of the parent's width. */
  width?: number | `${number}%`;
  height?: number;
  /** Corner radius in product units; text lines default to 4. */
  radius?: number;
  /** Layout classes only (flex, margin, alignment); colors and borders stay owned. */
  class?: string;
}

/** A single placeholder block, hidden from focus and the accessibility tree. */
export function SkeletonBlock(props: SkeletonBlockProps) {
  return (
    <View
      accessibilityElementsHidden
      class={`bg-skeleton shrink-0 ${props.class ?? ''}`}
      style={{
        width: props.width,
        height: props.height,
        borderRadius: props.radius ?? space('xxs'),
      }}
    />
  );
}

/** One loading region: inert blocks with a single busy announcement. */
export interface SkeletonRegionProps {
  /** Read once when the region appears, e.g. “正在加载精选内容”. */
  label: string;
  testID?: string;
  class?: string;
  style?: ViewProps['style'];
  children?: JSX.Element;
}

/** Groups placeholder blocks so the region is announced once and never steals focus. */
export function SkeletonRegion(props: SkeletonRegionProps) {
  return (
    <View
      accessible
      accessibilityLabel={props.label}
      accessibilityState={{ busy: true }}
      testID={props.testID}
      class={props.class}
      style={props.style}
    >
      {props.children}
    </View>
  );
}

/** Determinate input is value/max; position/duration are retained for existing playback consumers. */
export interface ProgressProps {
  value?: number;
  max?: number;
  label?: string;
  /** Names a progress bar whose visible context is supplied by its owner. */
  accessibilityLabel?: string;
  detail?: string;
  indeterminate?: boolean;
  position?: number;
  duration?: number;
  testID?: string;
}

/** Native range semantics and bounded motion; unknown totals never produce a percentage. */
export function Progress(props: ProgressProps) {
  const width = signal(0);
  const motion = createMotion();
  const max = () => props.max ?? props.duration ?? 100;
  const value = () => props.value ?? props.position;
  const unknown = () =>
    props.indeterminate ??
    (value() === undefined ||
      !Number.isFinite(max()) ||
      max() <= 0 ||
      (props.position !== undefined && props.duration === undefined && props.value === undefined));
  const percentage = () => {
    const current = value();
    return current === undefined || !Number.isFinite(current) || unknown()
      ? 0
      : Math.min(100, Math.max(0, (current / max()) * 100));
  };
  effect(() => {
    const travel = width() * 0.72;
    if (unknown() && !reduceMotion() && travel > 0)
      void motion.play({
        keyframes: { translateX: [0, travel] },
        duration: 1800,
        easing: 'linear',
        iterations: 'infinite',
        direction: 'alternate',
      });
    else motion.reset();
    return () => motion.stop();
  });
  return (
    <View testID={props.testID} style={{ gap: space('sm') }}>
      <If when={props.label}>
        <View class="flex-row flex-wrap items-center justify-between" style={{ gap: space('md') }}>
          <UiText>{props.label}</UiText>
          <If when={!unknown()}>
            <UiText role="meta">{`${Math.round(percentage())}%`}</UiText>
          </If>
        </View>
      </If>
      <BaseProgress
        accessibilityLabel={props.accessibilityLabel ?? props.label ?? '进度'}
        value={percentage()}
        indeterminate={unknown()}
        onLayout={({ bounds }) => width.set(bounds.size.width)}
        trackClass="bg-border overflow-hidden"
        trackStyle={{ height: SLIDER_TRACK_HEIGHT, borderRadius: radius('full') }}
        indicatorClass={`h-full bg-primary ${unknown() ? 'w-[28%]' : ''}`}
        indicatorStyle={unknown() ? motion.style : undefined}
      />
      <If when={props.detail}>
        <UiText role="meta">{props.detail}</UiText>
      </If>
    </View>
  );
}

/** A stable row frame; domain actions and data remain with its caller. */
export interface ResultRowProps {
  title: string;
  description?: string;
  leading?: JSX.Element;
  children?: JSX.Element;
  action?: { label: string; onPress: () => void };
  selected?: boolean;
  testID?: string;
}

/** Gives identity, copy and trailing actions consistent lanes without nesting press targets. */
export function ResultRow(props: ResultRowProps) {
  return (
    <View
      testID={props.testID}
      style={{ padding: space('md'), gap: space('md'), borderRadius: radius('xl') }}
      class={`flex-row items-center ${props.selected ? 'bg-accent' : 'bg-card'}`}
    >
      {props.leading}
      <View class="flex-1 min-w-0" style={{ gap: space('xs') }}>
        <UiText role="title" tone={props.selected ? 'selected' : 'default'}>
          {props.title}
        </UiText>
        <If when={props.description}>
          <UiText role="meta">{props.description}</UiText>
        </If>
      </View>
      <View class="flex-row flex-wrap items-center" style={{ gap: space('sm') }}>
        {props.children}
        <If when={props.action}>
          <Button label={props.action!.label} onPress={() => props.action?.onPress()} />
        </If>
      </View>
    </View>
  );
}
