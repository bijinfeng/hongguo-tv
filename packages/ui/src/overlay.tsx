import { Check, ChevronDown, X } from 'nsh-icon-lucide';
import { ModalDismissScope, bindModalEscape, createModalDismiss } from './modal-dismiss';
import { RemoteFocusScope } from './remote-focus-scope';
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
import {
  border,
  controlMetrics,
  overlayShadow,
  radius,
  space,
  weight,
  focusRingClass,
} from './foundation';
import { Icon } from './icon';
import { textSize, textWeight } from './typography';

/** Popups stop short of the window edges and of a two-line hint. */
const TOOLTIP_MAX_WIDTH = 320;
const MENU_MIN_WIDTH = 200;

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

const popupClass = 'rounded-(--radius) border border-border bg-popover text-popover-foreground';
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
  /** `lg` is the TV composition width from the design contract (800); `md` is the desktop 480. */
  size?: 'md' | 'lg';
  /** Stable component selector. */
  testID?: string;
}

/** A themed NSH dialog, with shared dimensions and native modal behavior. */
export function Dialog(props: DialogProps) {
  const focusInset = () => Math.max(6, space('xs'));
  recoverSource(
    () => props.open,
    () => props.returnFocus?.(),
  );
  const dismissal = createModalDismiss(() => props.onOpenChange({ open: false, reason: 'cancel' }));
  bindModalEscape(() => props.open, dismissal.cancel);
  return (
    <ModalDismissScope.Provider value={dismissal}>
      <BaseDialog
        open={props.open}
        testID={props.testID}
        role={props.role ?? 'dialog'}
        accessibilityLabel={props.title}
        accessibilityDescription={props.description}
        animation={reduceMotion() ? 'none' : 'fade'}
        closeOnEscape={false}
        onCancel={dismissal.cancel}
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
        // A dark page scrim cannot darken a black background, so the dialog carries its own edge:
        // a hairline makes the modal boundary read in both themes.
        class="m-auto bg-popover border border-input"
        backdropClass="bg-cinema/40"
        style={{
          boxShadow: overlayShadow,
          borderWidth: border,
          width: Math.max(
            0,
            Math.min(props.size === 'lg' ? 800 : 480, windowSize().width - space('3xl')),
          ),
          maxHeight: Math.max(0, windowSize().height - 64),
          padding: space('xl'),
          gap: space('lg'),
          borderRadius: controlMetrics().radius,
        }}
      >
        <RemoteFocusScope />
        <View class="flex-row items-center justify-between" style={{ gap: space('md') }}>
          <Text
            role="header"
            class="flex-1 text-popover-foreground"
            style={{
              fontSize: textSize('section'),
              fontWeight: textWeight('section'),
            }}
          >
            {props.title}
          </Text>
          <If when={props.closeButton}>
            <Button
              label="关闭"
              icon={X}
              iconOnly
              variant="quiet"
              onPress={() => props.onOpenChange({ open: false, reason: 'cancel' })}
            />
          </If>
        </View>
        <If when={props.description}>
          <Text
            class="text-muted-foreground"
            style={{ fontSize: textSize('body'), fontWeight: textWeight('body') }}
          >
            {props.description}
          </Text>
        </If>
        <Scroll
          class="min-h-0 shrink"
          style={{
            margin: -focusInset(),
            maxHeight: Math.max(0, windowSize().height - 240 + focusInset() * 2),
          }}
          contentStyle={{ padding: focusInset(), gap: space('md') }}
        >
          {props.children}
        </Scroll>
        <If when={props.footer}>{props.footer}</If>
      </BaseDialog>
    </ModalDismissScope.Provider>
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
        <View class="flex-row flex-wrap justify-end" style={{ gap: space('sm') }}>
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
        <Text
          role="alert"
          class="text-destructive"
          style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta') }}
        >
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
  const dismissal = createModalDismiss(() => props.onOpenChange({ open: false, reason: 'cancel' }));
  bindModalEscape(() => props.open, dismissal.cancel);
  return (
    <ModalDismissScope.Provider value={dismissal}>
      <BaseSheet
        open={props.open}
        side="right"
        testID={props.testID}
        closeOnEscape={false}
        onCancel={dismissal.cancel}
        closeOnBackdropPress
        closeOnSwipe={false}
        popupClass="bg-popover"
        popupStyle={{
          boxShadow: overlayShadow,
          width: Math.min(440, windowSize().width),
          padding: space('xl'),
          gap: space('lg'),
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
        <RemoteFocusScope />
        <View class="flex-row items-center justify-between" style={{ gap: space('md') }}>
          <Text
            role="header"
            class="flex-1 text-popover-foreground"
            style={{
              fontSize: textSize('section'),
              fontWeight: textWeight('section'),
            }}
          >
            {props.title}
          </Text>
          <Button
            label="关闭"
            icon={X}
            iconOnly
            variant="quiet"
            testID={props.testID ? `${props.testID}-close` : undefined}
            onPress={() => props.onOpenChange({ open: false, reason: 'cancel' })}
          />
        </View>
        <Scroll class="flex-1 min-h-0" contentStyle={{ gap: space('md'), padding: space('xs') }}>
          {props.children}
        </Scroll>
        <If when={props.footer}>{props.footer}</If>
      </BaseSheet>
    </ModalDismissScope.Provider>
  );
}

/** One command, keyed by stable identity; selection state belongs to the caller. */
export interface MenuCommand {
  /** Stable identity, not the translated label. */
  id: string;
  /** The visible command. */
  label: string;
  /** Optional official Lucide semantic icon. */
  icon?: string;
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
  let trigger: ViewRef | undefined;
  return (
    <BaseMenu
      testID={props.testID}
      open={open() && !props.disabled}
      offset={space('xs')}
      margin={space('sm')}
      popupClass={`${popupClass} ${popupMotion()}`}
      popupStyle={{
        boxShadow: overlayShadow,
        minWidth: MENU_MIN_WIDTH,
        maxWidth: Math.max(0, windowSize().width - space('lg')),
        padding: space('xs'),
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
      // A menu that closes leaves the keyboard nowhere; return it to the trigger first, then let
      // the caller move it somewhere better if it wants to.
      onClose={() => {
        trigger?.focus();
        props.returnFocus?.();
      }}
      trigger={
        <Button
          buttonRef={(ref) => (trigger = ref)}
          label={props.label}
          dropdown
          popupOpen={open()}
          expanded={open()}
          disabled={props.disabled}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          // A primary press has to open it too: NSH's `trigger` only wires the secondary button,
          // a long press and Shift+F10, which left the dropdown chevron unresponsive.
          onPress={() => {
            if (props.open === undefined) localOpen.set(!localOpen());
            props.onOpenChange?.({ open: !open(), reason: 'triggerPress' });
          }}
        />
      }
    >
      <Each of={props.items} key={(command) => command.id}>
        {(command) => (
          <View>
            <If when={command().separatorBefore}>
              <MenuSeparator class="h-px bg-border" style={{ marginVertical: space('xs') }} />
            </If>
            <MenuItem
              disabled={command().disabled}
              checked={command().checked}
              accessibilityLabel={command().label}
              testID={props.testID ? `${props.testID}-${command().id}` : undefined}
              onSelect={() => props.onSelect({ id: command().id })}
              class={`group flex-row items-center hover:bg-muted active:bg-border focus:bg-accent ${focusRingClass(2)} disabled:bg-transparent`}
              style={{
                minHeight: controlMetrics().height,
                paddingHorizontal: controlMetrics().paddingHorizontal,
                gap: controlMetrics().gap,
                borderRadius: controlMetrics().radius,
              }}
              indicatorClass="group items-center justify-center"
              indicatorStyle={{
                width: controlMetrics().iconSize,
                height: controlMetrics().iconSize,
              }}
              indicator={
                <View class="opacity-0 group-checked:opacity-100">
                  <Icon icon={Check} />
                </View>
              }
            >
              <If when={command().icon}>
                <Icon icon={command().icon!} />
              </If>
              <Text
                class={`${command().destructive ? 'text-destructive' : 'text-popover-foreground'} group-disabled:text-muted-foreground`}
                style={{ fontSize: controlMetrics().fontSize, fontWeight: weight.regular() }}
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
      offset={space('xs')}
      margin={space('sm')}
      popupClass={`${popupClass} ${popupMotion()}`}
      popupStyle={{
        boxShadow: overlayShadow,
        width: Math.max(0, Math.min(320, windowSize().width - space('lg'))),
        padding: space('lg'),
        gap: space('md'),
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
          dropdown
          popupOpen={open()}
          expanded={open()}
          buttonRef={(ref) => (trigger = ref)}
          testID={props.testID ? `${props.testID}-trigger` : undefined}
          // A primary press has to open it too: NSH's `trigger` only wires the secondary button,
          // a long press and Shift+F10, which left the dropdown chevron unresponsive.
          onPress={() => {
            if (props.open === undefined) localOpen.set(!localOpen());
            props.onOpenChange?.({ open: !open(), reason: 'triggerPress' });
          }}
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
  /** Suppresses the hint where instructions must stay visible instead. */
  disabled?: boolean;
}

/** A pointer/keyboard hint; callers disable it where persistent instructions replace it. */
export function Tooltip(props: TooltipProps) {
  return (
    <BaseTooltip
      open={props.open}
      disabled={props.disabled}
      testID={props.testID}
      class={`${popupClass} ${popupMotion()}`}
      style={{
        boxShadow: overlayShadow,
        maxWidth: TOOLTIP_MAX_WIDTH,
        paddingHorizontal: space('sm'),
        paddingVertical: space('xs'),
      }}
      startingClass={reduceMotion() ? '' : 'opacity-0'}
      endingClass={reduceMotion() ? '' : 'opacity-0'}
    >
      <Text
        class="text-popover-foreground"
        style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta') }}
      >
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
      style={{ padding: space('md'), gap: space('md') }}
      startingClass={reduceMotion() ? '' : 'opacity-0'}
      endingClass={reduceMotion() ? '' : 'opacity-0'}
    >
      <Text
        class={`flex-1 ${props.tone === 'error' ? 'text-destructive' : 'text-popover-foreground'}`}
        style={{ fontSize: controlMetrics().fontSize, fontWeight: weight.regular() }}
      >
        {props.message}
      </Text>
      <If when={props.onDismiss}>
        <Button
          label="关闭提示"
          icon={X}
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
          right: space('lg'),
          bottom: space('lg'),
          width: Math.max(0, Math.min(360, windowSize().width - space('3xl'))),
        }}
      >
        <ToastStack
          testID={props.testID}
          placement="bottomRight"
          motion={{
            duration: reduceMotion() ? 0 : 180,
            exitDuration: reduceMotion() ? 0 : 100,
            expandedGap: space('sm'),
            collapsedPeek: space('xs'),
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
      style={{ gap: space('sm') }}
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
      style={{ gap: space('xs') }}
    >
      {props.children}
    </ToolbarGroup>
  );
}

/** A noninteractive line between meaningful action groups. */
export function ActionBarSeparator() {
  return <ToolbarSeparator class="w-px bg-border" style={{ height: space('lg') }} />;
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
                class={`group flex-row items-center justify-between hover:bg-muted active:bg-border ${focusRingClass(2)} disabled:bg-muted`}
                style={{
                  minHeight: controlMetrics().height,
                  paddingHorizontal: controlMetrics().paddingHorizontal,
                  gap: controlMetrics().gap,
                  borderRadius: controlMetrics().radius,
                }}
              >
                <Text
                  class="flex-1 text-foreground group-disabled:text-muted-foreground"
                  style={{ fontSize: controlMetrics().fontSize, fontWeight: weight.strong() }}
                >
                  {section().title}
                </Text>
                <View
                  class={`group-aria-expanded:rotate-180 ${reduceMotion() ? '' : 'transition-transform duration-100'}`}
                >
                  <Icon icon={ChevronDown} />
                </View>
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel keepMounted reveal={false} accessibilityLabel={section().title}>
              <View
                style={{
                  gap: space('md'),
                  paddingHorizontal: controlMetrics().paddingHorizontal,
                  paddingTop: space('xs'),
                  paddingBottom: space('lg'),
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
      class={`group flex-row items-center ${focusRingClass(2)}`}
      style={{ minHeight: controlMetrics().height, borderRadius: controlMetrics().radius }}
    >
      <Text
        class={
          props.disabled || !props.href
            ? 'text-muted-foreground'
            : 'text-foreground underline group-hover:text-accent-foreground'
        }
        style={{ fontSize: controlMetrics().fontSize, fontWeight: weight.regular() }}
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
  /** Shows the remote wording and drops the keycap monospace treatment. */
  remote?: boolean;
  /** The existing command's short meaning. */
  label: string;
  /** Stable selector. */
  testID?: string;
}

/** A hint with no focus target and no shortcut registration. */
export function KeyHint(props: KeyHintProps) {
  return (
    <View testID={props.testID} class="flex-row items-center" style={{ gap: space('xs') }}>
      <Text
        class={`bg-muted text-foreground ${props.remote ? '' : 'font-mono'}`}
        style={{
          fontSize: textSize('meta'),
          fontWeight: textWeight('meta'),
          borderRadius: radius('sm'),
          paddingHorizontal: space('xs'),
          paddingVertical: space('xxs'),
        }}
      >
        {props.remote ? props.remoteLabel : props.keyLabel}
      </Text>
      <Text
        class="text-muted-foreground"
        style={{ fontSize: textSize('meta'), fontWeight: textWeight('meta') }}
      >
        {props.label}
      </Text>
    </View>
  );
}
