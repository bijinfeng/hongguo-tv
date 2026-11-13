import {
  Image,
  Canvas,
  Path2D,
  token,
  windowSize,
  Text,
  View,
  context,
  effect,
  signal,
  reduceMotion,
  fontScale,
  type ImageAsset,
  type JSX,
  type InputRef,
  type ViewRef,
} from 'nsh';
import { Button as BaseButton, Input as BaseInput, Toolbar, Select } from 'nsh/base';
import { entrance } from './motion';

/** Product target, deliberately independent of the host operating system. */
export type ProductTarget = 'desktop' | 'tv';
export const Product = context<ProductTarget>('desktop');
export const uiScale = { desktop: { control: 44 }, tv: { control: 60 } };
/** Map the approved 1920-wide TV composition to the host's logical viewport. */
export const tvUnit = (value: number) => (value * windowSize().width) / 1920;

const iconPaths = {
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  search: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0M16 16l5 5',
  history: 'M3 11a9 9 0 1 1 2.4 7M3 4v7h7m2-5v6l4 2',
  play: 'm9 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  next: 'm5 5 11 7-11 7ZM19 5v14',
  volume: 'M4 9h4l5-4v14l-5-4H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  mute: 'M4 9h4l5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6',
  fullscreen: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  close: 'm6 6 12 12M6 18 18 6',
  user: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21a8 8 0 0 1 16 0',
  back: 'm14 5-7 7 7 7',
  forward: 'm9 5 7 7-7 7',
  down: 'm5 9 7 7 7-7',
  lock: 'M4 10h16v11H4ZM8 10V6a4 4 0 0 1 8 0v4m-4 5v2',
};
export type IconName = keyof typeof iconPaths;
export {
  CinemaButton,
  CinemaSlider,
  CinemaSelect,
  CinemaControls,
  CinemaText,
  EpisodePanel,
} from './player';
/** The approved prototype's line icons, drawn through the native canvas. */
export function Icon(props: { name: IconName; color?: string }) {
  return (
    <Canvas
      style={{
        width: Product() === 'tv' ? tvUnit(26) : 20,
        height: Product() === 'tv' ? tvUnit(26) : 20,
      }}
      draw={(cx, size) => {
        cx.scale(size.width / 24, size.height / 24);
        cx.strokeStyle = props.color ?? token('foreground');
        cx.lineWidth = 1.7;
        cx.lineCap = 'round';
        cx.lineJoin = 'round';
        cx.stroke(new Path2D(iconPaths[props.name]));
      }}
    />
  );
}

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

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  variant?: 'navigation' | 'quiet';
  icon?: IconName;
  iconOnly?: boolean;
  displayLabel?: string;
  compact?: boolean;
  episode?: boolean;
  testID?: string;
  buttonRef?: (ref: ViewRef) => void;
}) {
  return (
    <BaseButton
      ref={props.buttonRef}
      style={{
        minHeight:
          Product() === 'tv'
            ? tvUnit(props.episode ? 80 : uiScale.tv.control)
            : props.compact
              ? 36
              : props.episode
                ? 48
                : props.variant === 'navigation'
                  ? 46
                  : uiScale.desktop.control,
        ...(Product() === 'tv'
          ? {
              borderRadius: tvUnit(12),
              borderWidth: tvUnit(1),
              paddingHorizontal: tvUnit(24),
              paddingVertical: tvUnit(12),
              gap: tvUnit(12),
            }
          : {}),
      }}
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      selected={props.selected}
      accessibilityLabel={props.label}
      class={`flex-row items-center gap-3 ${props.variant === 'navigation' && Product() === 'desktop' ? 'justify-start' : 'justify-center'} rounded-(--radius) border px-3 py-2 active:opacity-70 focus-visible:border-ring disabled:opacity-40 ${reduceMotion() ? '' : 'transition-colors duration-100'} ${props.primary ? 'bg-primary border-primary hover:bg-primary/90' : props.episode ? 'bg-muted border-transparent hover:bg-accent' : props.variant ? 'bg-transparent border-transparent hover:bg-muted' : 'bg-card border-border hover:bg-accent'} selected:bg-accent`}
    >
      <If when={props.icon}>
        <Icon
          name={props.icon!}
          color={token(
            props.primary
              ? 'primary-foreground'
              : props.selected
                ? 'accent-foreground'
                : 'foreground',
          )}
        />
      </If>
      <If when={!props.iconOnly}>
        <Text
          style={
            Product() === 'tv'
              ? { fontSize: tvUnit(props.variant === 'navigation' ? 24 : 22) }
              : undefined
          }
          class={`${Product() === 'tv' ? 'text-xl' : props.compact ? 'text-sm' : props.variant === 'navigation' ? 'text-[15px]' : 'text-base'} ${props.primary ? 'font-semibold text-primary-foreground' : props.selected ? 'font-semibold text-accent-foreground' : 'text-foreground'}`}
        >
          {props.displayLabel ?? props.label}
        </Text>
      </If>
    </BaseButton>
  );
}
export function SearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: (ref: InputRef) => void;
  embedded?: boolean;
}) {
  return (
    <BaseInput
      style={{
        minHeight: Product() === 'tv' ? tvUnit(64) : uiScale.desktop.control,
        ...(Product() === 'tv' ? { borderRadius: tvUnit(12), borderWidth: tvUnit(1) } : {}),
        ...(Product() === 'tv'
          ? { fontSize: tvUnit(24), paddingLeft: tvUnit(24), paddingRight: tvUnit(24) }
          : {}),
      }}
      testID="search-input"
      ref={props.inputRef}
      value={props.value}
      onChange={({ value }) => props.onChange(value)}
      onSubmit={props.onSubmit}
      placeholder={props.embedded ? '搜索短剧、演员' : '搜索短剧'}
      accessibilityLabel="搜索短剧"
      class={`flex-1 rounded-(--radius) text-foreground ${props.embedded ? 'border-2 border-transparent focus:border-ring bg-transparent text-sm px-1 py-2' : `border-2 border-input bg-card px-4 py-2 focus:border-ring ${Product() === 'tv' ? 'text-xl' : 'text-base'}`}`}
    />
  );
}
export function Surface(props: { children?: JSX.Element; class?: string }) {
  const motion = entrance();
  return (
    <View
      style={{
        ...motion.style,
        ...(Product() === 'tv'
          ? { padding: tvUnit(24), gap: tvUnit(16), borderRadius: tvUnit(12) }
          : {}),
      }}
      class={`gap-4 rounded-(--radius) bg-card p-5 ${props.class ?? ''}`}
    >
      {props.children}
    </View>
  );
}
export function Notice(props: { message: string; error?: boolean; retry?: () => void }) {
  return (
    <Surface>
      <Text
        style={Product() === 'tv' ? { fontSize: tvUnit(22) } : undefined}
        class={`${Product() === 'tv' ? 'text-xl' : 'text-base'} ${props.error ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {props.message}
      </Text>
      <If when={props.retry}>
        <Button label="重试" onPress={() => props.retry?.()} />
      </If>
    </Surface>
  );
}
export function Controls(props: {
  label: string;
  children?: JSX.Element;
  vertical?: boolean;
  class?: string;
}) {
  return (
    <Toolbar
      accessibilityLabel={props.label}
      axis={props.vertical ? 'vertical' : 'horizontal'}
      class={`${props.vertical ? 'flex-col' : 'flex-row flex-wrap'} gap-3 ${props.class ?? ''}`}
    >
      {props.children}
    </Toolbar>
  );
}

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
      class={`overflow-hidden rounded-(--radius) bg-muted justify-center items-center ${props.class ?? ''}`}
    >
      <If when={props.src && !failed()} else={<View />}>
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
  selected?: boolean;
  testID: string;
  buttonRef?: (ref: ViewRef) => void;
}) {
  return (
    <BaseButton
      ref={props.buttonRef}
      testID={props.testID}
      onPress={props.onPress}
      accessibilityLabel={props.title}
      selected={props.selected}
      style={Product() === 'tv' ? { borderRadius: tvUnit(12) } : undefined}
      class="flex-1 gap-3 rounded-(--radius) border-2 border-transparent hover:bg-muted focus-visible:border-ring active:opacity-70 selected:bg-accent"
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
      <Text
        style={Product() === 'tv' ? { fontSize: tvUnit(24) } : undefined}
        class={`${Product() === 'tv' ? 'text-xl' : 'text-lg'} text-foreground font-semibold line-clamp-2`}
      >
        {props.title}
      </Text>
      <If when={props.caption}>
        <Text
          style={Product() === 'tv' ? { fontSize: tvUnit(20) } : undefined}
          class={`${Product() === 'tv' ? 'text-lg' : 'text-sm'} text-muted-foreground`}
        >
          {props.caption}
        </Text>
      </If>
    </BaseButton>
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
    <Select
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
          icon="down"
          onPress={() => open.set(true)}
        />
      }
      popupClass="bg-card border border-border rounded-(--radius) p-2"
      itemClass="p-3 text-foreground hover:bg-muted focus:bg-accent selected:bg-accent"
    />
  );
}

export function Progress(props: { position: number; duration?: number }) {
  return (
    <View class="h-1 bg-muted overflow-hidden rounded-(--radius)">
      <If when={props.duration && props.duration > 0}>
        <View
          class="h-full bg-primary"
          style={{
            width: `${Math.min(100, Math.max(0, (props.position / props.duration!) * 100))}%`,
          }}
        />
      </If>
    </View>
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
      class="flex-row border border-border rounded-(--radius) bg-card overflow-hidden h-40"
    >
      <View class="w-[108px]">
        <Cover src={props.image} title={props.title} class="w-full h-full rounded-none" />
      </View>
      <View class="flex-1 px-6 py-4 gap-2 justify-center">
        <Text class="text-lg font-semibold text-foreground line-clamp-1">{props.title}</Text>
        <Text class="text-sm text-muted-foreground">{props.subtitle}</Text>
        <View class="max-w-[210px]">
          <Progress position={props.position} duration={props.duration} />
        </View>
        <View class="items-start pt-1">
          <Button
            compact
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
        compact
      />
    </View>
  );
}
