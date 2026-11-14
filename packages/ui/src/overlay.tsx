import {
  Overlay,
  Scroll,
  Text,
  View,
  cleanup,
  effect,
  reduceMotion,
  signal,
  windowSize,
  type JSX,
  type ViewRef,
} from 'nsh';
import {
  Accordion as BaseAccordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
  Dialog as BaseDialog,
  Link as BaseLink,
  Menu as BaseMenu,
  MenuItem,
  MenuSeparator,
  Popover as BasePopover,
  Sheet as BaseSheet,
  Toast as BaseToast,
  ToastStack,
  Toolbar as BaseToolbar,
  ToolbarGroup,
  ToolbarSeparator,
  Tooltip as BaseTooltip,
  type DialogChangeReason,
  type OpenChangeReason,
  type ToastTransitionStatus,
} from 'nsh/base';
import { Button } from './button';
import { Product, controlMetrics, tvUnit } from './foundation';
import { Icon, type IconName } from './icon';

/** A controlled popup's requested state; the caller commits it before a later opening. */
export interface PopupChangeEvent {
  /** Whether the popup should remain open. */
  open: boolean;
  /** Native reason reported by the shared behavior primitive. */
  reason: OpenChangeReason;
}

/** A controlled dialog's requested state. */
export interface DialogChangeEvent {
  /** Whether the dialog remains open. */
  open: boolean;
  /** Native reason reported by the dialog. */
  reason: DialogChangeReason;
}

const unit = (desktop: number, tv = desktop) => (Product() === 'tv' ? tvUnit(tv) : desktop);
const popupClass = 'rounded-(--radius) border border-border bg-card';
const popupMotion = () => (reduceMotion() ? '' : 'transition-opacity duration-100');

// Host dismissal and an owner's open=false both remove the native surface.
// Defer source recovery until the removal commit, cancelling stale reopen work.
function recoverSource(open: () => boolean, restore: () => void) {
  let wasOpen = false;
  let frame: number | undefined;
  effect(() => {
    const next = open();
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    if (wasOpen && !next) {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (!open()) restore();
      });
    }
    wasOpen = next;
  });
  cleanup(() => cancelAnimationFrame(frame));
}

/** A modal decision or form. The caller owns open state and the return focus target. */
export interface DialogProps {
  /** Controlled visibility. */
  open: boolean;
  /** The visible heading and accessible name. */
  title: string;
  /** Optional concise context read after the title. */
  description?: string;
  /** Use alertdialog for an explicit confirmation. */
  role?: 'dialog' | 'alertdialog';
  /** The bounded body; a single internal Scroll owns overflow. */
  children?: JSX.Element;
  /** Actions outside the scrolling body. */
  footer?: JSX.Element;
  /** A close button in the header, omitted when the footer already owns dismissal. */
  closeButton?: boolean;
  /** Called for native dismissal and the optional header close action. */
  onOpenChange: (event: DialogChangeEvent) => void;
  /** Runs after the dialog has appeared and child refs are available. */
  onOpen?: () => void;
  /** Runs after the dialog has gone. */
  onClose?: () => void;
  /** Restores the caller's surviving source after onClose. */
  returnFocus?: () => void;
  /** Focuses the first appropriate field or safe action when opened. */
  initialFocus?: () => void;
  /** Stable component selector. */
  testID?: string;
}

/** A themed NSH dialog, with shared dimensions and native modal behavior. */
export function Dialog(props: DialogProps) {
  recoverSource(
    () => props.open,
    () => props.returnFocus?.(),
  );
  return (
    <BaseDialog
      open={props.open}
      testID={props.testID}
      role={props.role ?? 'dialog'}
      accessibilityLabel={props.title}
      accessibilityDescription={props.description}
      animation={reduceMotion() ? 'none' : 'fade'}
      closeOnEscape
      closeOnBackdropPress
      closeOnSwipe={false}
      onOpenChange={props.onOpenChange}
      onOpen={() => {
        props.initialFocus?.();
        props.onOpen?.();
      }}
      onClose={() => {
        props.onClose?.();
        props.returnFocus?.();
      }}
      class="m-auto rounded-(--radius) bg-card"
      backdropClass="bg-cinema/40"
      style={{
        width: Math.max(0, Math.min(unit(480, 800), windowSize().width - unit(48, 96))),
        maxHeight: Math.max(0, windowSize().height - unit(64, 96)),
        padding: unit(32, 32),
        gap: unit(24, 24),
        borderRadius: controlMetrics().radius,
      }}
    >
      <View class="flex-row items-center justify-between gap-4">
        <Text
          role="header"
          class="flex-1 min-w-0 font-semibold text-foreground"
          style={{ fontSize: unit(24, 32) }}
        >
          {props.title}
        </Text>
        <If when={props.closeButton}>
          <Button
            label="关闭"
            icon="close"
            iconOnly
            variant="quiet"
            onPress={() => props.onOpenChange({ open: false, reason: 'cancel' })}
          />
        </If>
      </View>
      <If when={props.description}>
        <Text class="text-muted-foreground" style={{ fontSize: controlMetrics().fontSize }}>
          {props.description}
        </Text>
      </If>
      <Scroll
        class="min-h-0 shrink"
        style={{ maxHeight: Math.max(0, windowSize().height - unit(240, 320)) }}
        contentClass="gap-4"
      >
        {props.children}
      </Scroll>
      <If when={props.footer}>{props.footer}</If>
    </BaseDialog>
  );
}

/** An explicit confirmation. The owner performs and commits the operation. */
export interface ConfirmDialogProps {
  /** Controlled visibility. */
  open: boolean;
  /** The object and action being confirmed. */
  title: string;
  /** The real scope or consequence. */
  description: string;
  /** A precise commit verb. */
  confirmLabel: string;
  /** The safe action, Cancel by default. */
  cancelLabel?: string;
  /** Destructive commits use the shared danger treatment. */
  destructive?: boolean;
  /** Prevents duplicate commits while leaving cancellation available. */
  pending?: boolean;
  /** A relevant failure, preserved in the dialog. */
  error?: string;
  /** The owner updates its open value. */
  onOpenChange: (event: DialogChangeEvent) => void;
  /** Requested commitment; the dialog never closes optimistically. */
  onConfirm: () => void;
  /** Optional safe-action notification. */
  onCancel?: () => void;
  /** The surviving source to restore on close. */
  returnFocus?: () => void;
  /** Stable component selector. */
  testID?: string;
}

/** A confirmation whose initial keyboard target is always the safe action. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  let cancelRef: ViewRef | undefined;
  return (
    <Dialog
      open={props.open}
      title={props.title}
      description={props.description}
      role="alertdialog"
      testID={props.testID}
      initialFocus={() => cancelRef?.focus()}
      returnFocus={props.returnFocus}
      onOpenChange={(event) => {
        props.onOpenChange(event);
        if (!event.open) props.onCancel?.();
      }}
      footer={
        <View class="flex-row flex-wrap justify-end" style={{ gap: unit(12, 16) }}>
          <Button
            label={props.cancelLabel ?? '取消'}
            buttonRef={(ref) => {
              cancelRef = ref;
            }}
            testID={props.testID ? `${props.testID}-cancel` : undefined}
            onPress={() => {
              props.onOpenChange({ open: false, reason: 'cancel' });
              props.onCancel?.();
            }}
          />
          <Button
            label={props.confirmLabel}
            variant={props.destructive ? 'destructive' : 'primary'}
            pending={props.pending}
            testID={props.testID ? `${props.testID}-confirm` : undefined}
            onPress={props.onConfirm}
          />
        </View>
      }
    >
      <If when={props.error}>
        <Text role="alert" class="text-destructive" style={{ fontSize: controlMetrics().fontSize }}>
          {props.error}
        </Text>
      </If>
    </Dialog>
  );
}

/** A controlled right-side panel, with a single scrolling body. */
export interface SidePanelProps {
  /** Controlled visibility. */
  open: boolean;
  /** Visible and accessible heading. */
  title: string;
  /** Content in the panel's scroll region. */
  children?: JSX.Element;
  /** Persistent actions after the scroll region. */
  footer?: JSX.Element;
  /** The owner updates open when dismissed. */
  onOpenChange: (event: PopupChangeEvent) => void;
  /** Runs when the panel has appeared. */
  onOpen?: () => void;
  /** Runs when the panel has disappeared. */
  onClose?: () => void;
  /** Focuses the first appropriate target after the panel appears. */
  initialFocus?: () => void;
  /** Restores the caller's source after onClose. */
  returnFocus?: () => void;
  /** Stable component selector. */
  testID?: string;
}

/** An edge panel that preserves NSH's dismissal, focus boundary and reduced motion. */
export function SidePanel(props: SidePanelProps) {
  recoverSource(
    () => props.open,
    () => props.returnFocus?.(),
  );
  return (
    <BaseSheet
      open={props.open}
      side="right"
      testID={props.testID}
      closeOnEscape
      closeOnBackdropPress
      closeOnSwipe={false}
      popupClass="bg-card"
      popupStyle={{
        width: Math.min(unit(440, 640), windowSize().width),
        padding: unit(32, 32),
        gap: unit(24, 24),
      }}
      backdropClass="bg-cinema/40"
      onOpenChange={props.onOpenChange}
      onOpen={() => {
        props.initialFocus?.();
        props.onOpen?.();
      }}
      onClose={() => {
        props.onClose?.();
        props.returnFocus?.();
      }}
    >
      <View class="flex-row items-center justify-between gap-4">
        <Text
          role="header"
          class="flex-1 min-w-0 font-semibold text-foreground"
          style={{ fontSize: unit(24, 32) }}
        >
          {props.title}
        </Text>
        <Button
          label="关闭"
          icon="close"
          iconOnly
          variant="quiet"
          onPress={() => props.onOpenChange({ open: false, reason: 'cancel' })}
        />
      </View>
      <Scroll class="flex-1 min-h-0" contentClass="gap-4 p-2">
        {props.children}
      </Scroll>
      <If when={props.footer}>{props.footer}</If>
    </BaseSheet>
  );
}

/** One command, keyed by stable identity; selection state belongs to the caller. */
export interface MenuCommand {
  /** Stable identity, not the translated label. */
  id: string;
  /** The visible command. */
  label: string;
  /** Optional official Lucide semantic icon. */
  icon?: IconName;
  /** Disabled commands remain visible and are skipped by keyboard navigation. */
  disabled?: boolean;
  /** Defined only for checkable commands. */
  checked?: boolean;
  /** Separate a meaningful command group. */
  separatorBefore?: boolean;
  /** A destructive command has explicit danger text. */
  destructive?: boolean;
}

/** A command menu. Base owns popup placement and keyboard selection. */
export interface MenuProps {
  /** The visible trigger label and accessible name. */
  label: string;
  /** Stable commands; the owner decides their meaning. */
  items: MenuCommand[];
  /** Optional controlled visibility; omitted means local UI state. */
  open?: boolean;
  /** Disables the trigger. */
  disabled?: boolean;
  /** Command selection, before native dismissal. */
  onSelect: (event: { id: string }) => void;
  /** Native requested visibility. */
  onOpenChange?: (event: PopupChangeEvent) => void;
  /** Optional explicit source recovery after native close. */
  returnFocus?: () => void;
  /** Stable selector prefix for trigger and commands. */
  testID?: string;
}

/** The shared command menu, styled from one popup surface and target scale. */
export function Menu(props: MenuProps) {
  const localOpen = signal(false);
  const open = () => props.open ?? localOpen();
  return (
    <BaseMenu
      testID={props.testID}
      open={open() && !props.disabled}
      offset={unit(8, 12)}
      margin={unit(12, 24)}
      popupClass={`${popupClass} ${popupMotion()}`}
      popupStyle={{
        minWidth: unit(200, 280),
        maxWidth: Math.max(0, windowSize().width - unit(24, 48)),
        padding: unit(8, 8),
        borderRadius: controlMetrics().radius,
      }}
      popupStartingClass={reduceMotion() ? '' : 'opacity-0'}
      popupEndingClass={reduceMotion() ? '' : 'opacity-0'}
      backdropClass="bg-cinema/40"
      onOpenChange={(event) => {
        if (props.disabled && event.open) return;
        if (props.open === undefined) localOpen.set(event.open);
        props.onOpenChange?.(event);
      }}
      onClose={props.returnFocus}
      trigger={
        <View
          disabled={props.disabled}
          accessibilityLabel={props.label}
          accessibilityState={{ disabled: !!props.disabled, expanded: open() }}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          class={`flex-row items-center justify-between rounded-(--radius) border focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${props.disabled ? 'bg-muted border-transparent' : open() ? 'bg-accent border-border' : 'bg-card border-border hover:bg-muted active:bg-muted'}`}
          style={{
            minHeight: controlMetrics().height,
            paddingHorizontal: controlMetrics().paddingHorizontal,
            gap: controlMetrics().gap,
          }}
        >
          <Text
            class={props.disabled ? 'text-muted-foreground' : 'text-foreground'}
            style={{ fontSize: controlMetrics().fontSize }}
          >
            {props.label}
          </Text>
          <Icon name="down" />
        </View>
      }
    >
      <Each of={props.items} key={(command) => command.id}>
        {(command) => (
          <View>
            <If when={command().separatorBefore}>
              <MenuSeparator class="my-2 h-px bg-border" />
            </If>
            <MenuItem
              disabled={command().disabled}
              checked={command().checked}
              accessibilityLabel={command().label}
              testID={props.testID ? `${props.testID}-${command().id}` : undefined}
              onSelect={() => props.onSelect({ id: command().id })}
              class="group flex-row items-center rounded-(--radius) hover:bg-muted active:bg-muted focus:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:bg-transparent"
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                gap: controlMetrics().gap,
              }}
              indicatorClass="group items-center justify-center"
              indicatorStyle={{
                width: controlMetrics().iconSize,
                height: controlMetrics().iconSize,
              }}
              indicator={
                <View class="opacity-0 group-checked:opacity-100">
                  <Icon name="check" />
                </View>
              }
            >
              <If when={command().icon}>
                <Icon name={command().icon!} />
              </If>
              <Text
                class={`${command().destructive ? 'text-destructive' : 'text-foreground'} group-disabled:text-muted-foreground`}
                style={{ fontSize: controlMetrics().fontSize }}
              >
                {command().label}
              </Text>
            </MenuItem>
          </View>
        )}
      </Each>
    </BaseMenu>
  );
}

/** An anchored content surface; content and open state belong to the caller. */
export interface PopoverProps {
  /** Visible trigger and accessible name. */
  label: string;
  /** Optional controlled visibility. */
  open?: boolean;
  /** Bounded anchored content. */
  children?: JSX.Element;
  /** Native open requests. */
  onOpenChange?: (event: PopupChangeEvent) => void;
  /** Focuses a content target after opening. */
  initialFocus?: () => void;
  /** Called after closing when explicit source recovery is needed. */
  returnFocus?: () => void;
  /** Stable selector. */
  testID?: string;
}

/** A themed, non-modal anchored surface using native placement and dismissal. */
export function Popover(props: PopoverProps) {
  const localOpen = signal(false);
  let trigger: ViewRef | undefined;
  let closeReason: OpenChangeReason | undefined;
  const open = () => props.open ?? localOpen();
  return (
    <BasePopover
      testID={props.testID}
      open={open()}
      align="start"
      offset={unit(8, 12)}
      margin={unit(12, 24)}
      popupClass={`${popupClass} ${popupMotion()}`}
      popupStyle={{
        width: Math.max(0, Math.min(unit(320, 480), windowSize().width - unit(24, 48))),
        padding: unit(24, 24),
        gap: unit(16, 16),
        borderRadius: controlMetrics().radius,
      }}
      popupStartingClass={reduceMotion() ? '' : 'opacity-0'}
      popupEndingClass={reduceMotion() ? '' : 'opacity-0'}
      onOpenChange={(event) => {
        closeReason = event.open ? undefined : event.reason;
        if (props.open === undefined) localOpen.set(event.open);
        props.onOpenChange?.(event);
      }}
      onOpen={props.initialFocus}
      onClose={() => {
        if (closeReason !== 'pressOutside') trigger?.focus();
        props.returnFocus?.();
      }}
      trigger={
        <Button
          label={props.label}
          icon="down"
          buttonRef={(ref) => (trigger = ref)}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          onPress={() => {}}
        />
      }
    >
      {props.children}
    </BasePopover>
  );
}

/** A supplemental hint passed through a control's tooltip prop. */
export interface TooltipProps {
  /** The concise hint; critical instructions must remain in the page. */
  label: string;
  /** Explicit opening for review or programmatic help. */
  open?: boolean;
  /** Stable selector. */
  testID?: string;
}

/** A pointer/keyboard hint, disabled on TV where instructions stay visible. */
export function Tooltip(props: TooltipProps) {
  return (
    <BaseTooltip
      open={props.open}
      disabled={Product() === 'tv'}
      testID={props.testID}
      class={`${popupClass} ${popupMotion()}`}
      style={{
        maxWidth: unit(320, 480),
        paddingHorizontal: unit(12, 16),
        paddingVertical: unit(8, 12),
      }}
      startingClass={reduceMotion() ? '' : 'opacity-0'}
      endingClass={reduceMotion() ? '' : 'opacity-0'}
    >
      <Text class="text-foreground" style={{ fontSize: unit(14, 20) }}>
        {props.label}
      </Text>
    </BaseTooltip>
  );
}

/** A short, noncritical message. The caller owns its lifecycle and dismissal. */
export interface ToastProps {
  /** Readable message and accessible announcement. */
  message: string;
  /** Neutral feedback or a real failure. */
  tone?: 'default' | 'error';
  /** Explicit lifecycle from the owner's manager, present by default. */
  phase?: ToastTransitionStatus;
  /** Explicit dismissal, also used for a native swipe. */
  onDismiss?: () => void;
  /** Stable selector. */
  testID?: string;
}

/** A themed semantic toast; important results belong in persistent Notice content. */
export function Toast(props: ToastProps) {
  return (
    <BaseToast
      transitionStatus={props.phase ?? 'present'}
      accessibilityLabel={props.message}
      testID={props.testID}
      onDismissRequest={props.onDismiss}
      swipeDirection={props.onDismiss ? 'right' : null}
      class={`${popupClass} flex-row items-center ${popupMotion()}`}
      style={{ padding: unit(16, 24), gap: unit(16, 24) }}
      startingClass={reduceMotion() ? '' : 'opacity-0'}
      endingClass={reduceMotion() ? '' : 'opacity-0'}
    >
      <Text
        class={`flex-1 min-w-0 ${props.tone === 'error' ? 'text-destructive' : 'text-foreground'}`}
        style={{ fontSize: controlMetrics().fontSize }}
      >
        {props.message}
      </Text>
      <If when={props.onDismiss}>
        <Button
          label="关闭提示"
          icon="close"
          iconOnly
          variant="quiet"
          onPress={() => props.onDismiss?.()}
        />
      </If>
    </BaseToast>
  );
}

/** One keyed feedback message; lifecycle comes from its owner. */
export interface ToastMessage {
  /** Stable identity. */
  id: string;
  /** Accessible message. */
  message: string;
  /** Semantic feedback tone. */
  tone?: 'default' | 'error';
  /** Native lifecycle phase. */
  phase?: ToastTransitionStatus;
}

/** A surface-level feedback stack, not an application-global singleton. */
export interface ToastRegionProps {
  /** Mounted messages in oldest-first order. */
  items: ToastMessage[];
  /** The owner removes or begins ending the chosen message. */
  onDismiss: (event: { id: string }) => void;
  /** Pause an owning timeout manager while interaction expands the stack. */
  onExpandedChange?: (event: { expanded: boolean }) => void;
  /** Stable selector prefix. */
  testID?: string;
}

/** A bottom-right NSH stack; no hidden timers or network effects are created. */
export function ToastRegion(props: ToastRegionProps) {
  return (
    <If when={props.items.length > 0}>
      <Overlay
        class="absolute"
        style={{
          right: unit(24, 48),
          bottom: unit(24, 48),
          width: Math.max(0, Math.min(unit(360, 600), windowSize().width - unit(48, 96))),
        }}
      >
        <ToastStack
          testID={props.testID}
          placement="bottomRight"
          motion={{
            duration: reduceMotion() ? 0 : 180,
            exitDuration: reduceMotion() ? 0 : 100,
            expandedGap: unit(12, 16),
            collapsedPeek: unit(8, 12),
          }}
          onExpandedChange={props.onExpandedChange}
          onCancel={() => {
            const newest = props.items[props.items.length - 1];
            if (newest) props.onDismiss({ id: newest.id });
          }}
        >
          <Each of={props.items} key={(message) => message.id}>
            {(message) => (
              <Toast
                message={message().message}
                tone={message().tone}
                phase={message().phase}
                testID={props.testID ? `${props.testID}-${message().id}` : undefined}
                onDismiss={() => props.onDismiss({ id: message().id })}
              />
            )}
          </Each>
        </ToastStack>
      </Overlay>
    </If>
  );
}

/** A set of related controls; their values and actions remain owned by the caller. */
export interface ActionBarProps {
  /** Accessible group name. */
  label: string;
  /** Disables every semantic toolbar item. */
  disabled?: boolean;
  /** Controls and optional ActionBarGroup / ActionBarSeparator. */
  children?: JSX.Element;
  /** Stable selector. */
  testID?: string;
}

/** One shared toolbar: native roving focus on desktop, host navigation on TV. */
export function ActionBar(props: ActionBarProps) {
  return (
    <BaseToolbar
      accessibilityLabel={props.label}
      disabled={props.disabled}
      testID={props.testID}
      class="flex-row flex-wrap items-center"
      style={{ gap: unit(12, 16) }}
    >
      {props.children}
    </BaseToolbar>
  );
}

/** A labeled run of actions sharing the toolbar's keyboard boundary. */
export function ActionBarGroup(props: { label: string; children?: JSX.Element }) {
  return (
    <ToolbarGroup
      accessibilityLabel={props.label}
      class="flex-row items-center"
      style={{ gap: unit(8, 12) }}
    >
      {props.children}
    </ToolbarGroup>
  );
}

/** A noninteractive line between meaningful action groups. */
export function ActionBarSeparator() {
  return <ToolbarSeparator class="w-px bg-border" style={{ height: unit(24, 32) }} />;
}

/** A stable, controlled expandable section. */
export interface AccordionSection {
  /** Stable state identity, independent of translated title. */
  id: string;
  /** Visible section title. */
  title: string;
  /** Unavailable sections cannot be activated. */
  disabled?: boolean;
  /** Section content, retained while folded and excluded from focus. */
  content: JSX.Element;
}

/** The caller owns the expanded ids and content. */
export interface AccordionProps {
  /** Expanded section identities. */
  value: string[];
  /** Stable sections. */
  items: AccordionSection[];
  /** Allow several sections open, true by default. */
  multiple?: boolean;
  /** Disable section triggers. */
  disabled?: boolean;
  /** Reports requested expanded identities. */
  onChange: (event: { value: string[] }) => void;
  /** Stable selector prefix. */
  testID?: string;
}

/** Styled disclosure sections, keeping base heading, region and focus semantics. */
export function Accordion(props: AccordionProps) {
  return (
    <BaseAccordion
      value={props.value}
      multiple={props.multiple ?? true}
      disabled={props.disabled}
      onChange={props.onChange}
      testID={props.testID}
    >
      <Each of={props.items} key={(section) => section.id}>
        {(section) => (
          <AccordionItem
            value={section().id}
            disabled={section().disabled}
            class="border-b border-border"
          >
            <AccordionHeader level={3}>
              <AccordionTrigger
                accessibilityLabel={section().title}
                testID={props.testID ? `${props.testID}-${section().id}` : undefined}
                class="group flex-row items-center justify-between rounded-(--radius) hover:bg-muted active:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:bg-muted"
                style={{
                  minHeight: controlMetrics().height,
                  paddingHorizontal: controlMetrics().paddingHorizontal,
                  gap: controlMetrics().gap,
                }}
              >
                <Text
                  class="flex-1 min-w-0 font-semibold text-foreground group-disabled:text-muted-foreground"
                  style={{ fontSize: controlMetrics().fontSize }}
                >
                  {section().title}
                </Text>
                <View
                  class={`group-aria-expanded:rotate-180 ${reduceMotion() ? '' : 'transition-transform duration-100'}`}
                >
                  <Icon name="down" />
                </View>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel keepMounted reveal={false} accessibilityLabel={section().title}>
              <View
                class="gap-4"
                style={{
                  paddingHorizontal: controlMetrics().paddingHorizontal,
                  paddingTop: unit(8, 8),
                  paddingBottom: unit(24, 24),
                }}
              >
                {section().content}
              </View>
            </AccordionPanel>
          </AccordionItem>
        )}
      </Each>
    </BaseAccordion>
  );
}

/** One independently controlled disclosure, using the same accordion semantics. */
export interface DisclosureProps {
  /** Visible heading. */
  title: string;
  /** Controlled expanded state. */
  open: boolean;
  /** Disables its trigger. */
  disabled?: boolean;
  /** Expanded content. */
  children?: JSX.Element;
  /** Reports requested expanded state. */
  onOpenChange: (event: { open: boolean }) => void;
  /** Stable selector prefix. */
  testID?: string;
}

/** A single section, without a second expansion state machine. */
export function Disclosure(props: DisclosureProps) {
  return (
    <Accordion
      value={props.open ? ['section'] : []}
      items={[
        { id: 'section', title: props.title, disabled: props.disabled, content: props.children },
      ]}
      onChange={({ value }) => props.onOpenChange({ open: value.includes('section') })}
      testID={props.testID}
    />
  );
}

/** An external resource; unavailable targets never accept activation. */
export interface LinkProps {
  /** The visible resource label. */
  label: string;
  /** A real URL; absent means unavailable. */
  href?: string;
  /** Explicit unavailable host or resource state. */
  disabled?: boolean;
  /** Native opening notification; opening remains the host's responsibility. */
  onOpen?: (event: { href: string }) => void;
  /** Stable selector. */
  testID?: string;
}

/** A true link, not a visual substitute for an application command. */
export function Link(props: LinkProps) {
  return (
    <BaseLink
      href={props.href}
      openWith="system"
      disabled={props.disabled || !props.href}
      accessibilityLabel={props.label}
      onOpen={props.onOpen}
      testID={props.testID}
      class="group flex-row items-center rounded-(--radius) focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      style={{ minHeight: controlMetrics().height }}
    >
      <Text
        class={
          props.disabled || !props.href
            ? 'text-muted-foreground'
            : 'text-foreground underline group-hover:text-primary'
        }
        style={{ fontSize: controlMetrics().fontSize }}
      >
        {props.label}
      </Text>
    </BaseLink>
  );
}

/** A display-only explanation of an existing command. */
export interface KeyHintProps {
  /** Desktop key wording, such as Enter or Esc. */
  keyLabel: string;
  /** Equivalent remote wording, such as 确认 or 返回. */
  remoteLabel: string;
  /** The existing command's short meaning. */
  label: string;
  /** Stable selector. */
  testID?: string;
}

/** A hint with no focus target and no shortcut registration. */
export function KeyHint(props: KeyHintProps) {
  return (
    <View testID={props.testID} class="flex-row items-center" style={{ gap: unit(8, 12) }}>
      <Text
        class={`rounded bg-muted text-foreground ${Product() === 'tv' ? '' : 'font-mono'}`}
        style={{
          fontSize: unit(14, 20),
          paddingHorizontal: unit(8, 12),
          paddingVertical: unit(4, 4),
        }}
      >
        {Product() === 'tv' ? props.remoteLabel : props.keyLabel}
      </Text>
      <Text class="text-muted-foreground" style={{ fontSize: unit(14, 20) }}>
        {props.label}
      </Text>
    </View>
  );
}
