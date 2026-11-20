import {
  Image,
  Canvas,
  Text,
  View,
  signal,
  effect,
  fontScale,
  reduceMotion,
  token,
  type JSX,
  type ViewRef,
} from 'nsh';
import { Select as BaseSelect } from 'nsh/base';
import { controlMetrics, radius, space } from './foundation';
import { textLineHeight, textSize, textWeight } from './typography';
import { Button } from './button';
import { CardRoot } from './card-controls';
import { CinemaButton } from './player';
import { Progress } from './display';

/** Continue cards keep a fixed thumbnail lane and a generous inset around the copy. */
const CONTINUE_CARD_MIN_HEIGHT = 170;
const CONTINUE_CARD_COVER_WIDTH = 108;
const CONTINUE_CARD_INSET = 20;

const POSTER_MIN_HEIGHT = 96;
const POSTER_MAX_HEIGHT = 240;
const POSTER_FALLBACK_HEIGHT = 352;
const POSTER_TEXT_ALLOWANCE = 112;
const CARD_MIN_HEIGHT = 340;
const DETAIL_CARD_MIN_HEIGHT = 380;

export interface CoverProps {
  src?: string;
  title: string;
  class?: string;
  height?: number;
  /** Standalone poster, flush continuation image, or cinema image. */
  variant?: 'poster' | 'inline' | 'feature';
}

/** Image failure never removes a card's readable title or action. No per-cell entrance animation. */
export function Cover(props: CoverProps) {
  const failed = signal(false);
  effect(() => {
    void props.src;
    failed.set(false);
  });
  return (
    <View
      accessibilityLabel={`${props.title}封面`}
      style={{
        ...(props.height ? { height: props.height } : {}),
        borderRadius: props.variant === 'feature' || props.variant === 'inline' ? 0 : radius('xl'),
      }}
      class={`overflow-hidden ${props.variant === 'feature' ? 'bg-cinema-control' : 'bg-muted'} justify-center items-center ${props.class ?? ''}`}
    >
      <If
        when={props.src && !failed()}
        else={
          <Text
            class={`${props.variant === 'feature' ? 'text-cinema-muted' : 'text-muted-foreground'} text-center`}
            style={{
              fontSize: textSize('meta'),
              padding: space('md'),
            }}
          >
            封面暂不可用
          </Text>
        }
      >
        <Image
          src={props.src}
          fadeDuration={reduceMotion() ? 0 : 100}
          onError={() => failed.set(true)}
          style={
            props.variant === 'feature'
              ? { objectPosition: 'center 28%' }
              : props.variant === 'inline'
                ? { objectPosition: 'top' }
                : { objectPosition: 'center 30%' }
          }
          class="w-full h-full object-cover"
        />
      </If>
    </View>
  );
}
export function PosterCard(props: {
  title: string;
  cover?: string;
  availableHeight?: number;
  width?: number;
  caption?: string;
  onPress: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  selected?: boolean;
  testID: string;
  buttonRef?: (ref: ViewRef) => void;
}) {
  const textHeight = signal(0);
  return (
    <CardRoot
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      onPress={props.onPress}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      selected={props.selected}
      accessibilityLabel={props.title}
      accessibilityDescription={props.caption}
      style={{
        borderRadius: controlMetrics().radius,
        gap: space('sm'),
      }}
      class="group flex-1 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
    >
      <Cover
        src={props.cover}
        title={props.title}
        class={`w-full group-hover:opacity-95 group-active:opacity-85 ${reduceMotion() ? '' : 'transition-opacity duration-100'}`}
        height={
          props.availableHeight !== undefined &&
          props.availableHeight > 0 &&
          !(props.width && props.width > 0 && props.availableHeight === undefined)
            ? Math.max(
                POSTER_MIN_HEIGHT,
                Math.min(
                  POSTER_MAX_HEIGHT,
                  (props.availableHeight || POSTER_FALLBACK_HEIGHT) -
                    POSTER_TEXT_ALLOWANCE * fontScale(),
                ),
              )
            : Math.min(
                (props.width ?? 180) * 1.35,
                props.availableHeight && props.availableHeight > 0 && textHeight() > 0
                  ? Math.max(96, props.availableHeight - textHeight() - 12)
                  : Infinity,
              )
        }
      />
      <View
        style={{ gap: space('xxs') }}
        onLayout={({ bounds }) => textHeight.set(bounds.size.height)}
      >
        <Text
          style={{
            fontSize: textSize('content-title'),
            lineHeight: textLineHeight('content-title'),
            fontWeight: textWeight('content-title'),
            color: token('foreground'),
          }}
          class="line-clamp-2"
        >
          {props.title}
        </Text>
        <If when={props.caption}>
          <Text
            style={{
              fontSize: textSize('meta'),
              lineHeight: textLineHeight('meta'),
              fontWeight: textWeight('meta'),
              color: token('muted-foreground'),
            }}
            class="line-clamp-2"
          >
            {props.caption}
          </Text>
        </If>
      </View>
    </CardRoot>
  );
}

export function EpisodeRange(props: {
  value: number;
  count: number;
  pageSize: number;
  /** Cinema pairing for the dark player rail; the light page keeps the default trigger. */
  cinema?: boolean;
  onChange: (value: number) => void;
}) {
  const open = signal(false);
  const title = () =>
    `${props.value * props.pageSize + 1}–${Math.min((props.value + 1) * props.pageSize, props.count)} 集`;
  return (
    <BaseSelect
      testID="episode-range"
      accessibilityLabel="集数区间"
      value={String(props.value)}
      open={open()}
      onOpenChange={({ open: value }) => open.set(value)}
      items={Array.from({ length: Math.ceil(props.count / props.pageSize) }, (_, i) => ({
        value: String(i),
        title: `${i * props.pageSize + 1}–${Math.min((i + 1) * props.pageSize, props.count)} 集`,
      }))}
      onChange={({ value }) => {
        if (value !== null) props.onChange(Number(value));
      }}
      trigger={
        props.cinema ? (
          <CinemaButton
            testID="episode-range-trigger"
            label={title()}
            icon="down"
            dropdown
            onPress={() => open.set(true)}
          />
        ) : (
          <Button
            testID="episode-range-trigger"
            label={title()}
            selectOpen={open()}
            dropdown
            onPress={() => open.set(true)}
          />
        )
      }
      popupClass="bg-popover border border-border"
      popupStyle={{ padding: space('xs'), borderRadius: radius('xl') }}
      itemClass="text-popover-foreground hover:bg-muted focus:bg-accent selected:bg-accent"
      itemStyle={{
        minHeight: controlMetrics().height,
        fontSize: controlMetrics().fontSize,
        paddingHorizontal: controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
        borderRadius: radius('lg'),
      }}
    />
  );
}

export function ContinueCard(props: {
  title: string;
  image?: string;
  subtitle: string;
  position: number;
  duration?: number;
  label: string;
  onPress: () => void;
  buttonRef: (ref: ViewRef) => void;
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityLabel={props.accessibilityLabel}
      class="flex-row border border-border bg-card overflow-hidden"
      style={{
        minHeight: CONTINUE_CARD_MIN_HEIGHT,
        borderRadius: controlMetrics().radius,
      }}
    >
      <View style={{ width: CONTINUE_CARD_COVER_WIDTH }} class="shrink-0">
        <Cover src={props.image} title={props.title} variant="inline" class="w-full h-full" />
      </View>
      <View
        class="flex-1 justify-center"
        style={{ padding: CONTINUE_CARD_INSET, gap: space('xxs') }}
      >
        <Text
          class="line-clamp-2"
          style={{
            fontSize: textSize('content-title'),
            lineHeight: textLineHeight('content-title'),
            fontWeight: textWeight('content-title'),
            color: token('foreground'),
          }}
        >
          {props.title}
        </Text>
        <Text
          class="text-muted-foreground"
          style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta') }}
        >
          {props.subtitle}
        </Text>
        <View style={{ paddingTop: space('sm') }}>
          <Progress position={props.position} duration={props.duration} />
        </View>
        <View class="items-start" style={{ paddingTop: space('sm') }}>
          <Button
            icon="forward"
            label={props.label}
            onPress={props.onPress}
            buttonRef={props.buttonRef}
          />
        </View>
      </View>
    </View>
  );
}

export function StoryFeature(props: {
  title: string;
  image?: string;
  meta: string;
  description?: string;
  footer?: string;
  detail?: boolean;
  children?: JSX.Element;
}) {
  return (
    <View
      class="relative overflow-hidden bg-cinema"
      style={{
        minHeight: props.detail ? DETAIL_CARD_MIN_HEIGHT : CARD_MIN_HEIGHT,
        borderRadius: radius('xl'),
      }}
    >
      <View class="absolute right-0 top-0 bottom-0 w-[48%]">
        <Cover
          src={props.image}
          title={props.title}
          variant="feature"
          class="w-full h-full rounded-none"
        />
        <Canvas
          class="absolute inset-0"
          draw={(cx, size) => {
            const gradient = cx.createLinearGradient(0, 0, size.width * 0.7, 0);
            gradient.addColorStop(0, token('cinema'));
            gradient.addColorStop(1, token('cinema-transparent'));
            cx.fillStyle = gradient;
            cx.fillRect(0, 0, size.width, size.height);
          }}
        />
      </View>
      <View
        style={{ width: '65%', padding: space('xl'), paddingLeft: space('2xl'), gap: space('md') }}
      >
        <Text
          style={{
            fontSize: textSize('page'),
            fontWeight: textWeight('page'),
            color: token('cinema-foreground'),
          }}
          class="line-clamp-2"
        >
          {props.title}
        </Text>
        <Text style={{ fontSize: textSize('title') }} class="text-cinema-muted">
          {props.meta}
        </Text>
        <If when={props.description}>
          <Text
            style={{ fontSize: textSize('content-title') }}
            class="text-cinema-foreground line-clamp-2"
          >
            {props.description}
          </Text>
        </If>
        <View class="items-start">{props.children}</View>
        <If when={props.footer}>
          <Text style={{ fontSize: textSize('title') }} class="text-cinema-muted">
            {props.footer}
          </Text>
        </If>
      </View>
    </View>
  );
}
export function ResultCard(props: {
  children?: JSX.Element;
  onPress: () => void;
  selected: boolean;
  testID: string;
  buttonRef: (ref: ViewRef) => void;
  label?: string;
}) {
  return (
    <View
      accessibilityLabel={props.label}
      style={{ paddingVertical: space('md'), gap: space('md') }}
      class="flex-row items-center border border-transparent border-b-border"
    >
      {props.children}
      <Button
        buttonRef={props.buttonRef}
        testID={props.testID}
        onPress={props.onPress}
        selected={props.selected}
        label={`${props.label ?? ''}，查看详情`}
        displayLabel="查看详情"
        icon="forward"
      />
    </View>
  );
}
