import {
  Canvas,
  Image,
  Text,
  View,
  createMotion,
  context,
  effect,
  cleanup,
  reduceMotion,
  signal,
  token,
  windowSize,
  type JSX,
  type ViewRef,
} from 'nsh';
import { Button, Select, Sheet, Slider } from 'nsh/base';
import { Icon, type IconName } from './icon';
import { controlMetrics, radius, space, weight, focusRingClass } from './foundation';
import { motionTokens } from './motion';
import { SelectFocus } from './select-focus';
import { selectItemClass, SelectItemLabel, selectItemLineHeight } from './select';
import { textSize, textWeight } from './typography';

const CinemaEnabled = context<() => boolean>(() => true);

/** Cinematic menus stay narrow and their setting labels align down the rail. */
const MENU_MIN_WIDTH = 120;
const EPISODE_SETTING_LABEL_WIDTH = 80;

/** The approved cinema controls share the app's target, icons and semantic theme. */
export function CinemaButton(props: {
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  /** Transparent resting fill for dismissive actions such as closing the player. */
  quiet?: boolean;
  disabled?: boolean;
  pending?: boolean;
  selected?: boolean;
  /** What a selected segment reads as: the muted `active` band (default) or the brand `accent`. */
  selectedTone?: 'active' | 'accent';
  /** Bounded visible label; the accessible name stays `label`. */
  displayLabel?: string;
  /** A list trigger: the chevron trails the label instead of leading it. */
  dropdown?: boolean;
  onPress: () => void;
  buttonRef?: (ref: ViewRef) => void;
  testID?: string;
}) {
  const enabled = CinemaEnabled();
  const blocked = () => props.disabled || props.pending || !enabled();
  const selectedAccent = !!props.selected && props.selectedTone === 'accent';
  return (
    <Button
      ref={(ref) => props.buttonRef?.(ref)}
      testID={props.testID}
      accessibilityLabel={props.pending ? `${props.label}，处理中` : props.label}
      tooltip={props.iconOnly ? props.label : undefined}
      disabled={blocked()}
      selected={props.selected}
      onPress={() => {
        if (!blocked()) props.onPress();
      }}
      style={{
        minHeight: controlMetrics().height,
        minWidth: props.iconOnly ? controlMetrics().height : undefined,
        paddingHorizontal: props.iconOnly
          ? controlMetrics().gap
          : controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
        borderRadius: controlMetrics().radius,
        gap: controlMetrics().gap,
      }}
      // Disabled keeps the control's own surface and only dims its content, so a blocked row
      // still reads as one family instead of three different treatments. A selected segment in
      // the brand accent reads as "this is the current value", not as a pressed state.
      class={`flex-row items-center justify-center border border-transparent ${props.quiet ? 'bg-transparent' : 'bg-cinema-control'} ${props.quiet || blocked() ? '' : 'hover:bg-cinema-hover active:bg-cinema-active'} ${focusRingClass(4, 'cinema-focus')} ${selectedAccent ? 'selected:bg-accent' : 'selected:bg-cinema-active'} ${reduceMotion() || blocked() ? '' : 'transition-colors duration-100'}`}
    >
      <If when={props.icon && !props.dropdown}>
        <Icon
          name={props.pending ? 'loader-circle' : props.icon!}
          color={token(blocked() ? 'cinema-muted' : 'cinema-foreground')}
        />
      </If>
      <If when={!props.iconOnly}>
        <Text
          style={{ fontSize: controlMetrics().fontSize }}
          class={
            blocked()
              ? 'text-cinema-muted'
              : selectedAccent
                ? 'text-accent-foreground'
                : 'text-cinema-foreground'
          }
        >
          {props.pending ? (props.displayLabel ?? '处理中…') : (props.displayLabel ?? props.label)}
        </Text>
      </If>
      <If when={props.icon && props.dropdown}>
        <Icon name={props.icon!} color={token('cinema-muted')} />
      </If>
    </Button>
  );
}

/**
 * One value chosen from a short set, laid out on the panel row itself: the panel is already
 * the overlay, so a popup inside it would be a second overlay for a two-press choice.
 */
export function CinemaChips(props: {
  label: string;
  value: string;
  items: { value: string; title: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
  testID?: string;
}) {
  return (
    <View
      accessibilityLabel={props.label}
      class="flex-row flex-wrap items-center"
      style={{ gap: space('xs') }}
    >
      <Each of={props.items} key={(item) => item.value}>
        {(item) => (
          <CinemaButton
            testID={props.testID ? `${props.testID}-${item().value}` : undefined}
            label={item().title}
            selected={props.value === item().value}
            selectedTone="accent"
            disabled={props.disabled}
            onPress={() => {
              if (props.value !== item().value) props.onChange(item().value);
            }}
          />
        )}
      </Each>
    </View>
  );
}

/** Dragging only previews; the owner commits on release. No media work belongs here. */
export function CinemaSlider(props: {
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  testID?: string;
}) {
  const enabled = CinemaEnabled();
  const blocked = () => !!props.disabled || !enabled() || !(props.max > 0);
  return (
    <Slider
      testID={props.testID}
      accessibilityLabel={props.label}
      value={props.value}
      min={0}
      max={Math.max(0, props.max)}
      step={props.compact ? 0.05 : 1}
      disabled={blocked()}
      onChange={({ value }) => {
        if (typeof value === 'number') props.onChange(value);
      }}
      onChangeEnd={({ value }) => {
        if (typeof value === 'number') props.onCommit?.(value);
      }}
      class="flex-1 min-w-0"
      trackClass="justify-center"
      trackStyle={{ minHeight: controlMetrics().height }}
      indicatorClass="rounded-full bg-cinema-track"
      indicatorStyle={{ height: space('xxs') }}
      // A blocked slider dims its own fill and thumb instead of staying at full brand strength,
      // matching the disabled buttons beside it.
      rangeClass={`rounded-full ${blocked() ? 'bg-cinema-muted' : 'bg-primary'}`}
      thumbClass={`rounded-full ${blocked() ? 'bg-cinema-muted' : 'bg-cinema-foreground'} hover:bg-cinema-focus active:bg-cinema-focus ${focusRingClass(4, 'cinema-focus')}`}
      thumbStyle={{
        width: space('md'),
        height: space('md'),
      }}
    />
  );
}

export function CinemaSelect(props: {
  label: string;
  value: string;
  items: { value: string; title: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const open = signal(false);
  const enabled = CinemaEnabled();
  effect(() => {
    if ((props.disabled || !enabled()) && open()) open.set(false);
  });
  return (
    <Select
      accessibilityLabel={props.label}
      value={props.value}
      items={props.items}
      disabled={props.disabled || !enabled()}
      open={open()}
      onOpenChange={({ open: value }) => {
        if ((props.disabled || !enabled()) && value) return;
        open.set(value);
        props.onOpenChange?.(value);
      }}
      onChange={({ value }) => {
        if (value !== null && !props.disabled && enabled()) props.onChange(value);
      }}
      trigger={
        <Button
          accessibilityLabel={props.label}
          disabled={props.disabled || !enabled()}
          onPress={() => open.set(true)}
          class={`flex-row items-center justify-center ${focusRingClass(4, 'cinema-focus')} ${open() ? 'bg-cinema-active' : 'bg-cinema-control hover:bg-cinema-hover active:bg-cinema-active'}`}
          style={{
            minHeight: controlMetrics().height,
            borderRadius: controlMetrics().radius,
            gap: controlMetrics().gap,
            paddingHorizontal: controlMetrics().paddingHorizontal,
            paddingVertical: controlMetrics().paddingVertical,
          }}
        >
          <SelectFocus open={open()} gap={controlMetrics().gap} stretch>
            <Text
              class={props.disabled || !enabled() ? 'text-cinema-muted' : 'text-cinema-foreground'}
              style={{ fontSize: controlMetrics().fontSize, flexShrink: 1 }}
            >
              {props.items.find((item) => item.value === props.value)?.title ?? props.label}
            </Text>
            <Icon
              name="down"
              color={token(props.disabled || !enabled() ? 'cinema-muted' : 'cinema-foreground')}
            />
          </SelectFocus>
        </Button>
      }
      placement="top"
      popupClass="bg-popover border border-border"
      popupStyle={{ minWidth: MENU_MIN_WIDTH, padding: space('xs'), borderRadius: radius('xl') }}
      empty={
        <Text
          class="text-muted-foreground"
          style={{
            fontSize: controlMetrics().fontSize,
            fontWeight: weight.regular(),
            paddingHorizontal: space('sm'),
            paddingVertical: space('xs'),
          }}
        >
          暂无可选项
        </Text>
      }
      itemClass={selectItemClass()}
      itemStyle={{
        minHeight: controlMetrics().height,
        fontSize: controlMetrics().fontSize,
        fontWeight: weight.regular(),
        lineHeight: selectItemLineHeight(controlMetrics().fontSize),
        paddingHorizontal: controlMetrics().paddingHorizontal,
        paddingVertical: controlMetrics().paddingVertical,
        borderRadius: radius('lg'),
      }}
      renderItem={(entry) => <SelectItemLabel entry={entry} />}
    />
  );
}

/**
 * The gradient overlay is for legibility over moving picture, not decoration.
 * `overlay` lays the controls over the picture; `band` is the strip below it, joined to the
 * picture by the hairline. Without a variant the strip is plain, on the dark surface the caller
 * already owns.
 *
 * Padding and type stay on the surface's tokens rather than the TV prototype's 1920 points
 * (80/32 padding, title 36, time 22): DESIGN's typography gives every target one scale, and the
 * TV theme already carries those roles as 960 dp values.
 */
export function CinemaControls(props: {
  children?: JSX.Element;
  visible?: boolean;
  variant?: 'band' | 'overlay';
}) {
  const overlay = () => props.variant === 'overlay';
  const band = () => props.variant === 'band';
  const motion = createMotion();
  const shown = signal(props.visible !== false);
  let revision = 0;
  cleanup(() => {
    revision++;
  });
  effect(() => {
    const visible = props.visible !== false;
    const current = ++revision;
    if (visible) shown.set(true);
    void motion.opacity
      .timing(visible ? 1 : 0, { duration: reduceMotion() ? 0 : motionTokens.base })
      .then(() => {
        if (!visible && current === revision) shown.set(false);
      });
  });
  return (
    <CinemaEnabled.Provider value={() => props.visible !== false}>
      <View
        testID="cinema-controls"
        style={{ opacity: motion.opacity }}
        accessibilityElementsHidden={props.visible === false}
        disabled={props.visible === false}
        class={
          !shown()
            ? 'hidden'
            : overlay()
              ? 'absolute bottom-0 left-0 right-0'
              : band()
                ? 'bg-cinema border-t border-cinema-active'
                : 'bg-cinema'
        }
      >
        <If when={overlay()}>
          <Canvas
            class="absolute inset-0"
            draw={(cx, size) => {
              const gradient = cx.createLinearGradient(0, 0, 0, size.height);
              gradient.addColorStop(0, token('cinema-transparent'));
              gradient.addColorStop(0.35, token('cinema'));
              cx.fillStyle = gradient;
              cx.fillRect(0, 0, size.width, size.height);
            }}
          />
        </If>
        <View
          style={{
            paddingTop: space('sm'),
            paddingBottom: space('sm'),
            paddingHorizontal: space('md'),
            gap: space('xxs'),
          }}
        >
          {props.children}
        </View>
      </View>
    </CinemaEnabled.Provider>
  );
}

export function CinemaText(props: {
  children?: JSX.Element;
  variant?: 'title' | 'stage' | 'time' | 'preview';
  testID?: string;
}) {
  return (
    <Text
      testID={props.testID}
      role={props.variant === 'stage' ? 'header' : undefined}
      accessibilityLevel={props.variant === 'stage' ? 1 : undefined}
      class={props.variant === 'title' ? 'line-clamp-2' : ''}
      style={{
        fontSize:
          props.variant === 'stage'
            ? textSize('page')
            : props.variant === 'title'
              ? textSize('title')
              : props.variant === 'preview'
                ? textSize('body')
                : textSize('meta'),
        fontWeight:
          props.variant === 'stage' || props.variant === 'title'
            ? textWeight('section')
            : textWeight('meta'),
        color: token(props.variant === 'time' ? 'cinema-muted' : 'cinema-foreground'),
      }}
    >
      {props.children}
    </Text>
  );
}

export function EpisodePanel(props: {
  open: boolean;
  onClose: () => void;
  cinema?: boolean;
  /** Accessible name of the dialog; it must match the heading the panel shows. */
  label: string;
  children?: JSX.Element;
}) {
  return (
    <Sheet
      open={props.open}
      side="right"
      onOpenChange={({ open }) => {
        if (!open) props.onClose();
      }}
      popupClass={props.cinema ? 'bg-cinema' : 'bg-popover'}
      popupStyle={{ width: Math.min(440, windowSize().width) }}
      backdropClass="bg-cinema/40"
    >
      <View
        role="dialog"
        accessibilityLabel={props.label}
        class="flex-1"
        style={{
          padding: space('xl'),
          gap: space('lg'),
        }}
      >
        {props.children}
      </View>
    </Sheet>
  );
}

export function CinemaStageAction(props: {
  label: string;
  showPlay?: boolean;
  disabled?: boolean;
  onPress: () => void;
  buttonRef?: (ref: ViewRef) => void;
}) {
  return (
    <Button
      ref={(ref) => props.buttonRef?.(ref)}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      class={`absolute inset-0 items-center justify-center bg-transparent ${focusRingClass(4, 'cinema-focus')}`}
    >
      <If when={props.showPlay && !props.disabled}>
        <View
          class="rounded-full bg-cinema/60 items-center justify-center"
          style={{
            width: 64,
            height: 64,
          }}
        >
          <Icon name="play" color={token('cinema-foreground')} />
        </View>
      </If>
    </Button>
  );
}

/**
 * One episode target on the dark rail. It carries the same selected/disabled/locked semantics as
 * the light `Button episode="player"`, in the cinema pairing, so the rail never re-skins itself.
 */
export function CinemaEpisodeButton(props: {
  index: number;
  label: string;
  selected?: boolean;
  locked?: boolean;
  disabled?: boolean;
  testID?: string;
  onPress: () => void;
}) {
  const enabled = CinemaEnabled();
  const blocked = () => !!props.disabled || !!props.locked || !enabled();
  const tone = () =>
    blocked() ? 'cinema-muted' : props.selected ? 'accent-foreground' : 'cinema-foreground';
  return (
    <Button
      testID={props.testID}
      accessibilityLabel={props.label}
      disabled={blocked()}
      selected={props.selected}
      onPress={() => {
        if (!blocked()) props.onPress();
      }}
      style={{
        minHeight: controlMetrics().height,
        paddingHorizontal: controlMetrics().gap,
        paddingVertical: controlMetrics().paddingVertical,
        borderRadius: controlMetrics().radius,
        gap: controlMetrics().gap,
      }}
      class={`flex-row items-center justify-center border ${focusRingClass(4, 'cinema-focus')} ${reduceMotion() ? '' : 'transition-colors duration-100'} ${
        props.selected
          ? 'bg-accent border-transparent'
          : blocked()
            ? 'bg-transparent border-cinema-track'
            : 'bg-cinema-control border-cinema-track hover:bg-cinema-hover active:bg-cinema-active'
      }`}
    >
      <If when={props.locked}>
        <Icon name="lock" color={token('cinema-muted')} size="sm" />
      </If>
      <Text
        style={{
          fontSize: controlMetrics('sm').fontSize,
          fontWeight: props.selected ? weight.strong() : weight.regular(),
          color: token(tone()),
          fontVariant: ['tabular-nums'],
        }}
      >
        {String(props.index).padStart(2, '0')}
      </Text>
    </Button>
  );
}

export function CinemaSettingRow(props: { label: string; children?: JSX.Element }) {
  return (
    <View class="flex-row items-center" style={{ gap: space('md') }}>
      <View style={{ minWidth: EPISODE_SETTING_LABEL_WIDTH }}>
        <CinemaText variant="preview">{props.label}</CinemaText>
      </View>
      <View class="flex-1">{props.children}</View>
    </View>
  );
}

/** The desktop rail's approved lane height; the episode grid scrolls inside it. */
const RAIL_HEIGHT = 552;

/**
 * The rail's lane beside the picture. Its definite height is what lets the caller's
 * `flex-1 min-h-0` chain resolve, so a long season scrolls within the lane instead of being
 * clipped by the rail's own overflow and the title above the grid stays put.
 */
export function EpisodeRail(props: { children?: JSX.Element; cinema?: boolean }) {
  return (
    <View
      class={`shrink-0 overflow-hidden border ${props.cinema ? 'bg-cinema-control border-cinema-active' : 'bg-card border-border'}`}
      style={{
        width: Math.min(316, windowSize().width),
        minWidth: Math.min(280, windowSize().width),
        height: Math.min(RAIL_HEIGHT, windowSize().height),
        borderRadius: controlMetrics().radius,
      }}
    >
      {props.children}
    </View>
  );
}

/**
 * The picture's resting composition. A portrait frame is shown whole, contained in the stage's
 * height; the side space takes a blurred, dimmed copy of the same poster rather than a second
 * image or a bare black field. Without a poster (or after it fails) the stage keeps only the dark
 * surface: a placeholder picture would be a claim the service did not make.
 */
export function CinemaStage(props: {
  image?: string;
  imageTitle: string;
  /** Height of the picture area; the stage owns no aspect of its own. */
  height: number;
  children?: JSX.Element;
}) {
  const failed = signal(false);
  effect(() => {
    void props.image;
    failed.set(false);
  });
  const showImage = () => !!props.image && !failed();
  return (
    <View
      class="relative overflow-hidden bg-cinema justify-center items-center"
      style={{ height: props.height, borderRadius: radius('xl') }}
    >
      <If when={showImage()}>
        <View
          accessibilityElementsHidden
          class="absolute inset-0"
          style={{
            opacity: 0.62,
            filter: 'blur(46px) saturate(1.2) brightness(0.42)',
            scale: 1.25,
          }}
        >
          <Image
            src={props.image!}
            onError={() => failed.set(true)}
            class="w-full h-full"
            style={{ objectFit: 'cover' }}
          />
        </View>
        <View
          class="h-full overflow-hidden"
          style={{ aspectRatio: '2/3', borderRadius: radius('sm') }}
        >
          <Image
            src={props.image!}
            onError={() => failed.set(true)}
            accessibilityLabel={`${props.imageTitle}封面`}
            class="w-full h-full"
            style={{ objectFit: 'contain' }}
          />
        </View>
      </If>
      <View
        accessibilityElementsHidden
        class="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(ellipse at 50% 45%, transparent 40%, #00000073)',
        }}
      />
      {props.children}
    </View>
  );
}
