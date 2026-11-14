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
import { Product, controlMetrics, tvUnit } from './foundation';
import { Button } from './button';
import { CardRoot } from './card-controls';
import { Progress } from './display';

/** Image failure never removes a card's readable title or action. No per-cell entrance animation. */
export function Cover(props: {
  src?: string;
  title: string;
  class?: string;
  height?: number;
  variant?: 'feature';
}) {
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
        ...(Product() === 'tv'
          ? { borderRadius: props.variant === 'feature' ? 0 : tvUnit(12) }
          : {}),
      }}
      class={`overflow-hidden rounded-(--radius) ${props.variant === 'feature' ? 'bg-cinema-control' : 'bg-muted'} justify-center items-center ${props.class ?? ''}`}
    >
      <If
        when={props.src && !failed()}
        else={
          <Text
            class={`${props.variant === 'feature' ? 'text-cinema-muted' : 'text-muted-foreground'} text-center`}
            style={{
              fontSize: Product() === 'tv' ? tvUnit(20) : 14,
              padding: Product() === 'tv' ? tvUnit(16) : 16,
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
              : Product() === 'tv'
                ? { objectPosition: 'top' }
                : undefined
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
  selected?: boolean;
  testID: string;
  buttonRef?: (ref: ViewRef) => void;
}) {
  return (
    <CardRoot
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      onPress={props.onPress}
      onFocus={props.onFocus}
      selected={props.selected}
      accessibilityLabel={props.title}
      style={{
        borderRadius: controlMetrics().radius,
        gap: Product() === 'tv' ? tvUnit(14) : 12,
      }}
      class="flex-1 rounded-(--radius) hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 active:opacity-80 selected:bg-accent"
    >
      <Cover
        src={props.cover}
        title={props.title}
        class="w-full"
        height={
          Product() === 'tv'
            ? Math.max(
                tvUnit(96),
                Math.min(
                  tvUnit(240),
                  (props.availableHeight || tvUnit(352)) - tvUnit(112) * fontScale(),
                ),
              )
            : (props.width ?? 180) * 1.35
        }
      />
      <View class="gap-1">
        <Text
          style={{ fontSize: Product() === 'tv' ? tvUnit(24) : 18 }}
          class="text-foreground font-semibold line-clamp-2"
        >
          {props.title}
        </Text>
        <If when={props.caption}>
          <Text
            style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
            class="text-muted-foreground"
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
        <Button
          testID="episode-range-trigger"
          label={title()}
          selectOpen={open()}
          icon="down"
          onPress={() => open.set(true)}
        />
      }
      popupClass="bg-card border border-border rounded-(--radius) p-2"
      itemClass="text-foreground rounded-lg hover:bg-muted focus:bg-accent selected:bg-accent"
      itemStyle={{
        minHeight: controlMetrics().height,
        fontSize: controlMetrics().fontSize,
        paddingHorizontal: controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
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
      class="flex-row border border-border rounded-(--radius) bg-card overflow-hidden"
      style={{
        minHeight: Product() === 'tv' ? tvUnit(240) : 170,
        borderRadius: controlMetrics().radius,
      }}
    >
      <View style={{ width: Product() === 'tv' ? tvUnit(160) : 108 }} class="shrink-0">
        <Cover src={props.image} title={props.title} class="w-full h-full rounded-none" />
      </View>
      <View
        class="flex-1 min-w-0 gap-1 justify-center"
        style={{ padding: Product() === 'tv' ? tvUnit(28) : 20 }}
      >
        <Text
          class="font-semibold text-foreground line-clamp-2"
          style={{ fontSize: Product() === 'tv' ? tvUnit(24) : 18 }}
        >
          {props.title}
        </Text>
        <Text
          class="text-muted-foreground"
          style={{ fontSize: Product() === 'tv' ? tvUnit(20) : 14 }}
        >
          {props.subtitle}
        </Text>
        <View style={{ paddingTop: Product() === 'tv' ? tvUnit(12) : 12 }}>
          <Progress position={props.position} duration={props.duration} />
        </View>
        <View class="items-start" style={{ paddingTop: Product() === 'tv' ? tvUnit(12) : 12 }}>
          <Button
            primary
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
      class="relative overflow-hidden rounded-(--radius) bg-cinema"
      style={{ minHeight: tvUnit(props.detail ? 380 : 340), borderRadius: tvUnit(12) }}
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
      <View style={{ width: '65%', padding: tvUnit(32), paddingLeft: tvUnit(44), gap: tvUnit(16) }}>
        <Text
          style={{ fontSize: tvUnit(48) }}
          class="font-semibold text-cinema-foreground line-clamp-2"
        >
          {props.title}
        </Text>
        <Text style={{ fontSize: tvUnit(20) }} class="text-cinema-muted">
          {props.meta}
        </Text>
        <If when={props.description}>
          <Text style={{ fontSize: tvUnit(22) }} class="text-cinema-foreground line-clamp-2">
            {props.description}
          </Text>
        </If>
        <View class="items-start">{props.children}</View>
        <If when={props.footer}>
          <Text style={{ fontSize: tvUnit(20) }} class="text-cinema-muted">
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
      style={
        Product() === 'tv'
          ? { paddingVertical: tvUnit(24), gap: tvUnit(28) }
          : { paddingVertical: 20 }
      }
      class="flex-row items-center gap-5 border border-transparent border-b-border"
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
