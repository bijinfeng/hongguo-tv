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
} from 'nsh';
import { Avatar as BaseAvatar, Progress as BaseProgress } from 'nsh/base';
import { Button } from './button';
import { Product, controlMetrics, tvUnit } from './foundation';
import { Icon, type IconName } from './icon';
import { textSize, type TextRole } from './typography';
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

const textColor = (tone?: TextTone, role?: TextRole) =>
  tone === 'error'
    ? 'text-destructive'
    : tone === 'selected'
      ? 'text-accent-foreground'
      : tone === 'cinema'
        ? 'text-cinema-foreground'
        : tone === 'muted' || (!tone && role === 'meta')
          ? 'text-muted-foreground'
          : 'text-foreground';
const unit = (value: number) => (Product() === 'tv' ? tvUnit(value) : value);

/** Renders one shared text role, retaining system font scaling and native selection. */
export function UiText(props: UiTextProps) {
  return (
    <View selectable={props.selectable} class="min-w-0">
      <Text
        testID={props.testID}
        role={['page', 'section', 'title'].includes(props.role ?? '') ? 'header' : undefined}
        accessibilityLevel={
          props.role === 'page'
            ? 1
            : props.role === 'section'
              ? 2
              : props.role === 'title'
                ? 3
                : undefined
        }
        style={{
          fontSize: textSize(props.role),
          lineHeight: textSize(props.role) * (props.role === 'page' ? 1.3 : 1.5),
          numberOfLines: props.lines ?? 0,
          textAlign: props.align ?? 'start',
        }}
        class={`${textColor(props.tone, props.role)} ${['page', 'section', 'title', 'content-title'].includes(props.role ?? '') ? 'font-semibold' : ''} ${props.role === 'numeric' ? 'tabular-nums' : ''} selection:bg-accent`}
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
      style={{ padding: unit(24), gap: unit(12), borderRadius: unit(12) }}
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
        minHeight: unit(28),
        paddingHorizontal: unit(10),
        paddingVertical: unit(3),
        gap: unit(6),
        borderRadius: unit(6),
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
        width: controlMetrics().height + (props.size === 'lg' ? unit(24) : 0),
        height: controlMetrics().height + (props.size === 'lg' ? unit(24) : 0),
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
          ? { width: unit(1), alignSelf: 'stretch' }
          : { height: unit(1), alignSelf: 'stretch' }
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
      style={{ minHeight: controlMetrics().height, gap: unit(12) }}
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
}

/** An in-place notice keeps error copy and retry together; it never animates on value changes. */
export function Notice(props: NoticeProps) {
  const width = signal(Infinity);
  const inline = () => width() >= unit(360);
  return (
    <View
      testID={props.testID}
      onLayout={({ bounds }) => {
        if (bounds.size.width > 0) width.set(bounds.size.width);
      }}
      style={{
        gap: unit(16),
        paddingHorizontal: unit(24),
        paddingVertical: unit(20),
        borderRadius: unit(12),
      }}
      class={`${inline() ? 'flex-row items-center' : 'items-start'} shrink-0 w-full min-w-0 bg-muted`}
    >
      <If when={props.error}>
        <Icon name="circle-alert" color={token('destructive')} />
      </If>
      <View class={`${inline() ? 'flex-1' : 'w-full'} min-w-0 gap-1`}>
        <If when={props.title}>
          <UiText role="body">{props.title}</UiText>
        </If>
        <Text
          android={{ accessibilityLiveRegion: 'polite' }}
          style={{
            fontSize: textSize(props.title ? 'meta' : 'body'),
            lineHeight: textSize(props.title ? 'meta' : 'body') * 1.5,
          }}
          class={props.error && !props.title ? 'text-destructive' : 'text-muted-foreground'}
        >
          {props.message}
        </Text>
      </View>
      <If when={props.retry}>
        <Button label={props.retryLabel ?? '重试'} onPress={() => props.retry?.()} />
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
        minHeight: unit(180),
        paddingVertical: unit(24),
        paddingHorizontal: unit(16),
        gap: unit(12),
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
      style={{ gap: Product() === 'tv' ? tvUnit(24) : 20 }}
      class="flex-row items-center"
    >
      <If when={props.variant === 'poster'}>
        <View
          style={{ width: '100%', aspectRatio: 2 / 2.7, borderRadius: unit(12) }}
          class="bg-muted"
        />
      </If>
      <If when={props.variant === 'result'}>
        <View
          style={{
            width: Product() === 'tv' ? tvUnit(96) : 72,
            height: Product() === 'tv' ? tvUnit(128) : 96,
            borderRadius: unit(8),
          }}
          class="bg-muted shrink-0"
        />
      </If>
      <If when={props.variant !== 'poster'}>
        <View class="flex-1" style={{ gap: unit(16) }}>
          <Each of={['68%', '88%', '44%']}>
            {(width) => (
              <View
                style={{
                  width: width() as `${number}%`,
                  height: Product() === 'tv' ? tvUnit(20) : 14,
                  borderRadius: unit(4),
                }}
                class="bg-muted"
              />
            )}
          </Each>
        </View>
      </If>
    </View>
  );
}

/** Determinate input is value/max; position/duration are retained for existing playback consumers. */
export interface ProgressProps {
  value?: number;
  max?: number;
  label?: string;
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
    <View testID={props.testID} style={{ gap: unit(12) }}>
      <If when={props.label}>
        <View class="flex-row flex-wrap items-center justify-between gap-4">
          <UiText>{props.label}</UiText>
          <If when={!unknown()}>
            <UiText role="meta">{`${Math.round(percentage())}%`}</UiText>
          </If>
        </View>
      </If>
      <BaseProgress
        accessibilityLabel={props.label ?? '进度'}
        value={percentage()}
        indeterminate={unknown()}
        onLayout={({ bounds }) => width.set(bounds.size.width)}
        trackClass="bg-input overflow-hidden"
        trackStyle={{ height: unit(6), borderRadius: unit(3) }}
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
      style={{ padding: unit(Product() === 'tv' ? 24 : 16), gap: unit(16), borderRadius: unit(12) }}
      class={`flex-row items-center ${props.selected ? 'bg-accent' : 'bg-card'}`}
    >
      {props.leading}
      <View class="flex-1 min-w-0 gap-2">
        <UiText role="title" tone={props.selected ? 'selected' : 'default'}>
          {props.title}
        </UiText>
        <If when={props.description}>
          <UiText role="meta">{props.description}</UiText>
        </If>
      </View>
      <View class="flex-row flex-wrap items-center gap-3">
        {props.children}
        <If when={props.action}>
          <Button label={props.action!.label} onPress={() => props.action?.onPress()} />
        </If>
      </View>
    </View>
  );
}
