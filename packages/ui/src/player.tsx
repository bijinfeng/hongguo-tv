import {
  Canvas,
  Text,
  View,
  createMotion,
  context,
  effect,
  cleanup,
  reduceMotion,
  signal,
  token,
  type JSX,
  type ViewRef,
} from 'nsh';
import { Button, Select, Sheet, Slider } from 'nsh/base';
import { Icon, Product, tvUnit, type IconName } from './index';
import { motionTokens } from './motion';

const CinemaEnabled = context<() => boolean>(() => true);

/** The approved cinema controls share the app's target, icons and semantic theme. */
export function CinemaButton(props: {
  label: string;
  icon?: IconName;
  iconOnly?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onPress: () => void;
  buttonRef?: (ref: ViewRef) => void;
  testID?: string;
}) {
  const enabled = CinemaEnabled();
  return (
    <Button
      ref={props.buttonRef}
      testID={props.testID}
      accessibilityLabel={props.label}
      tooltip={props.iconOnly ? props.label : undefined}
      disabled={props.disabled || !enabled()}
      selected={props.selected}
      onPress={props.onPress}
      style={{
        minHeight: Product() === 'tv' ? tvUnit(60) : 40,
        minWidth: Product() === 'tv' ? tvUnit(60) : 36,
        paddingHorizontal:
          Product() === 'tv' ? tvUnit(props.iconOnly ? 16 : 24) : props.iconOnly ? 6 : 8,
        paddingVertical: Product() === 'tv' ? tvUnit(12) : 6,
        borderRadius: Product() === 'tv' ? tvUnit(12) : 8,
        gap: Product() === 'tv' ? tvUnit(12) : 6,
      }}
      class={`flex-row items-center justify-center border border-transparent bg-cinema-control hover:bg-cinema-hover active:bg-cinema-active focus-visible:border-cinema-focus selected:bg-cinema-active disabled:opacity-40 ${reduceMotion() ? '' : 'transition-colors duration-100'}`}
    >
      <If when={props.icon}>
        <Icon name={props.icon!} color={token('cinema-foreground')} />
      </If>
      <If when={!props.iconOnly}>
        <Text
          style={{ fontSize: Product() === 'tv' ? tvUnit(22) : 14 }}
          class="text-cinema-foreground"
        >
          {props.label}
        </Text>
      </If>
    </Button>
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
  return (
    <Slider
      testID={props.testID}
      accessibilityLabel={props.label}
      value={props.value}
      min={0}
      max={Math.max(0, props.max)}
      step={props.compact ? 0.05 : 1}
      disabled={props.disabled || !enabled() || !(props.max > 0)}
      onChange={({ value }) => {
        if (typeof value === 'number') props.onChange(value);
      }}
      onChangeEnd={({ value }) => {
        if (typeof value === 'number') props.onCommit?.(value);
      }}
      class="flex-1 min-w-0 disabled:opacity-40"
      trackClass="justify-center"
      trackStyle={{ minHeight: Product() === 'tv' ? tvUnit(28) : 24 }}
      indicatorClass="rounded-full bg-cinema-track"
      indicatorStyle={{ height: Product() === 'tv' ? tvUnit(6) : 4 }}
      rangeClass="rounded-full bg-primary"
      thumbClass="rounded-full border-2 border-transparent bg-cinema-foreground hover:bg-cinema-focus active:bg-cinema-focus focus-visible:border-cinema-focus"
      thumbStyle={{
        width: Product() === 'tv' ? tvUnit(20) : 12,
        height: Product() === 'tv' ? tvUnit(20) : 12,
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
  return (
    <Select
      accessibilityLabel={props.label}
      value={props.value}
      items={props.items}
      disabled={props.disabled || !enabled()}
      open={open()}
      onOpenChange={({ open: value }) => {
        open.set(value);
        props.onOpenChange?.(value);
      }}
      onChange={({ value }) => {
        if (value !== null) props.onChange(value);
      }}
      class={`rounded-lg border border-transparent hover:bg-cinema-hover active:bg-cinema-active focus-visible:border-cinema-focus disabled:opacity-40 ${open() ? 'bg-cinema-active' : 'bg-cinema-control'}`}
      trigger={
        <View
          class="flex-row items-center justify-center"
          style={{
            minHeight: Product() === 'tv' ? tvUnit(60) : 40,
            gap: Product() === 'tv' ? tvUnit(12) : 6,
            paddingHorizontal: Product() === 'tv' ? tvUnit(24) : 8,
          }}
        >
          <Icon name="down" color={token('cinema-foreground')} />
          <Text
            class="text-cinema-foreground"
            style={{ fontSize: Product() === 'tv' ? tvUnit(22) : 14 }}
          >
            {props.items.find((item) => item.value === props.value)?.title ?? props.label}
          </Text>
        </View>
      }
      placement="top"
      popupClass="bg-card border border-border rounded-(--radius) p-2"
      popupStyle={{ minWidth: Product() === 'tv' ? tvUnit(220) : 120 }}
      itemClass="p-3 text-foreground hover:bg-muted focus:bg-accent selected:bg-accent"
      itemStyle={Product() === 'tv' ? { fontSize: tvUnit(22), padding: tvUnit(16) } : undefined}
    />
  );
}

/** TV's gradient is for legibility over moving picture, not decoration. */
export function CinemaControls(props: { children?: JSX.Element; visible?: boolean }) {
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
            : Product() === 'tv'
              ? 'absolute bottom-0 left-0 right-0'
              : 'bg-cinema'
        }
      >
        <If when={Product() === 'tv'}>
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
            paddingTop: Product() === 'tv' ? tvUnit(80) : 12,
            paddingBottom: Product() === 'tv' ? tvUnit(32) : 12,
            paddingHorizontal: Product() === 'tv' ? tvUnit(96) : 16,
            gap: Product() === 'tv' ? tvUnit(24) : 6,
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
  variant?: 'title' | 'time' | 'preview';
}) {
  return (
    <Text
      class={`${props.variant === 'title' ? 'font-semibold text-cinema-foreground line-clamp-2' : props.variant === 'preview' ? 'text-cinema-foreground' : 'text-cinema-muted'}`}
      style={{
        fontSize:
          Product() === 'tv'
            ? tvUnit(props.variant === 'title' ? 36 : props.variant === 'preview' ? 24 : 22)
            : props.variant === 'title'
              ? 24
              : 14,
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
  children?: JSX.Element;
}) {
  return (
    <Sheet
      open={props.open}
      side="right"
      onOpenChange={({ open }) => {
        if (!open) props.onClose();
      }}
      popupClass={props.cinema ? 'bg-cinema' : 'bg-card'}
      popupStyle={{ width: Product() === 'tv' ? tvUnit(820) : 400 }}
      backdropClass="bg-cinema/60"
    >
      <View
        role="dialog"
        accessibilityLabel={props.cinema ? '播放设置' : '选集'}
        class="flex-1"
        style={{
          padding: Product() === 'tv' ? tvUnit(36) : 24,
          gap: Product() === 'tv' ? tvUnit(24) : 20,
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
      ref={props.buttonRef}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      class="absolute inset-0 items-center justify-center bg-transparent border-2 border-transparent focus-visible:border-cinema-focus"
    >
      <If when={props.showPlay && !props.disabled}>
        <View class="w-16 h-16 rounded-full bg-cinema/60 items-center justify-center">
          <Icon name="play" color={token('cinema-foreground')} />
        </View>
      </If>
    </Button>
  );
}

export function CinemaSettingRow(props: { label: string; children?: JSX.Element }) {
  return (
    <View class="flex-row items-center" style={{ gap: Product() === 'tv' ? tvUnit(24) : 16 }}>
      <View style={{ minWidth: Product() === 'tv' ? tvUnit(120) : 80 }}>
        <CinemaText variant="preview">{props.label}</CinemaText>
      </View>
      <View class="flex-1">{props.children}</View>
    </View>
  );
}

export function EpisodeRail(props: { children?: JSX.Element }) {
  return (
    <View
      class="bg-card border border-border rounded-(--radius) overflow-hidden"
      style={{ width: 316, height: 552 }}
    >
      {props.children}
    </View>
  );
}
