package dev.hongguo.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.function.BooleanSupplier;

/** Shared production controls inside the real TV host; no catalog or account requests. */
@android.annotation.TargetApi(34)
final class ComponentAcceptance {
    private final Instrumentation runner;
    private final String profile;
    private final boolean reduced;
    private Activity activity;
    private int checks;

    ComponentAcceptance(Instrumentation runner, Bundle arguments) {
        this.runner = runner;
        profile = arguments.getString("appearance", "light");
        reduced = Boolean.parseBoolean(arguments.getString("reduced", "false"));
    }

    private AccessibilityNodeInfo root() {
        runner.getUiAutomation().clearCache();
        return runner.getUiAutomation().getRootInActiveWindow();
    }
    private AccessibilityNodeInfo id(AccessibilityNodeInfo node, String id) {
        if (node == null) return null;
        if (id.equals(node.getViewIdResourceName())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = id(node.getChild(i), id);
            if (found != null) return found;
        }
        return null;
    }
    private AccessibilityNodeInfo named(AccessibilityNodeInfo node, String label) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (label.contentEquals(node.getText() == null ? "" : node.getText())
                || label.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = named(node.getChild(i), label);
            if (found != null) return found;
        }
        return null;
    }
    private boolean focused(AccessibilityNodeInfo node) {
        if (node == null) return false;
        if (node.isFocused()) return true;
        for (int i = 0; i < node.getChildCount(); i++) if (focused(node.getChild(i))) return true;
        return false;
    }
    private boolean queryIs(String value) {
        AccessibilityNodeInfo field = id(root(), "gallery-query-activate");
        return field != null && ("搜索短剧、演员：" + value).contentEquals(field.getContentDescription());
    }
    private void check(String name, BooleanSupplier condition) {
        long end = SystemClock.uptimeMillis() + 10000;
        while (!condition.getAsBoolean()) {
            if (SystemClock.uptimeMillis() > end) throw new AssertionError(name);
            SystemClock.sleep(100);
        }
        checks++;
        Bundle status = new Bundle(); status.putString("stream", "PASS " + name + "\n"); runner.sendStatus(0, status);
    }
    private void key(int code) { runner.sendKeyDownUpSync(code); SystemClock.sleep(250); }
    private boolean scrollForward(AccessibilityNodeInfo node) {
        if (node == null) return false;
        if (node.isScrollable() && node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true;
        for (int i = 0; i < node.getChildCount(); i++) if (scrollForward(node.getChild(i))) return true;
        return false;
    }
    private void focus(String target) {
        AccessibilityNodeInfo node = id(root(), target);
        for (int attempt = 0; node == null && attempt < 30; attempt++) {
            if (!scrollForward(root())) break;
            SystemClock.sleep(150);
            node = id(root(), target);
        }
        if (node == null) throw new AssertionError("missing " + target);
        node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());
        SystemClock.sleep(200);
        node = id(root(), target);
        if (node == null || !node.isEnabled()
                || (!node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS))) throw new AssertionError("focus " + target);
        // An accepted accessibility request is not yet proof that its focus handoff completed.
        long until = SystemClock.uptimeMillis() + 1500;
        while (!focused(id(root(), target))) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError("observed focus " + target);
            SystemClock.sleep(50);
        }
        runner.waitForIdleSync();
    }
    private void activate(String target) {
        focus(target);
        key(KeyEvent.KEYCODE_DPAD_CENTER);
    }
    private void capture(String state) throws Exception {
        SystemClock.sleep(300);
        File directory = runner.getTargetContext().getExternalFilesDir(null);
        try (FileOutputStream out = new FileOutputStream(new File(directory, "components-" + profile + "-" + state + ".png"))) {
            Bitmap image = runner.getUiAutomation().takeScreenshot();
            if (image == null || !image.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new AssertionError("screenshot");
        }
        Files.write(new File(directory, "components-" + profile + "-" + state + ".txt").toPath(),
                describe(root()).getBytes(StandardCharsets.UTF_8));
    }
    private String describe(AccessibilityNodeInfo node) {
        if (node == null) return "";
        String result = node.getClassName() + " id=" + node.getViewIdResourceName() + " text=" + node.getText()
                + " label=" + node.getContentDescription() + " role=" + node.getExtras()
                + " focused=" + node.isFocused() + " enabled=" + node.isEnabled() + " clickable=" + node.isClickable() + "\n";
        for (int i = 0; i < node.getChildCount(); i++) result += describe(node.getChild(i));
        return result;
    }
    private EditText input(View view) {
        if (view instanceof EditText && view.hasFocus()) return (EditText) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            EditText found = input(((ViewGroup) view).getChildAt(i)); if (found != null) return found;
        }
        return null;
    }
    void run() {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("Leanback entry");
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            activity = runner.startActivitySync(launch);
            check("production gallery opens", () -> id(root(), "gallery-sheet-layers") != null);
            activate("gallery-sheet-layers");
            activate("gallery-open-dialog");
            check("dialog opens", () -> id(root(), "gallery-dialog") != null);
            check("dialog focuses its action", () -> focused(named(root(), "完成")));
            check("passive dialog content rejects action focus", () -> {
                AccessibilityNodeInfo body = named(root(), "春山不负 · 第 12 集");
                return body != null && !body.isClickable() && !body.isFocusable()
                        && !body.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            });
            capture("dialog"); key(KeyEvent.KEYCODE_BACK);
            check("dialog Back restores trigger", () -> id(root(), "gallery-dialog") == null && focused(id(root(), "gallery-open-dialog")));
            activate("gallery-open-confirm");
            check("confirmation starts on safe cancel", () -> focused(id(root(), "gallery-confirm-cancel")));
            capture("confirm"); key(KeyEvent.KEYCODE_BACK);
            check("confirmation Back restores trigger", () -> id(root(), "gallery-confirm") == null && focused(id(root(), "gallery-open-confirm")));
            activate("gallery-open-panel");
            check("side panel action is reachable", () -> named(root(), "第 12 集") != null);
            capture("panel"); key(KeyEvent.KEYCODE_BACK);
            check("side panel Back restores trigger", () -> named(root(), "第 12 集") == null && focused(id(root(), "gallery-open-panel")));
            activate("gallery-popover-trigger");
            check("popover presents its real body", () -> named(root(), "记录保存在当前设备，可随时移除。") != null);
            capture("popover"); key(KeyEvent.KEYCODE_BACK);
            check("popover Back restores trigger", () -> focused(id(root(), "gallery-popover-trigger")));
            activate("gallery-sheet-controls");
            AccessibilityNodeInfo primary = id(root(), "gallery-primary-selected");
            if (primary == null) throw new AssertionError("primary action");
            primary.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());
            SystemClock.sleep(150); primary = id(root(), "gallery-primary-selected");
            primary.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            AccessibilityNodeInfo toggle = id(root(), "gallery-toggle-pending");
            if (toggle == null || !toggle.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("pending toggle");
            check("pending action loses focus and rejects action focus", () -> {
                AccessibilityNodeInfo node = id(root(), "gallery-primary-selected");
                return node != null && !node.isEnabled() && !node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
            });
            capture("pending");
            toggle = id(root(), "gallery-toggle-pending");
            if (toggle == null || !toggle.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("pending recovery");
            check("recovered action becomes reachable", () -> id(root(), "gallery-primary-selected").isEnabled());
            activate("gallery-primary-selected");
            check("recovered action activates once", () -> named(root(), "选择观看") != null && named(root(), "已选择观看") == null);
            activate("gallery-sheet-forms"); activate("gallery-query-activate");
            check("confirm enters native editor", () -> input(activity.getWindow().getDecorView()) != null);
            String query = "春山归来重生之后".repeat(6);
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
                connection.setComposingText("春山", 1);
                connection.commitText(query, 1); connection.finishComposingText();
            });
            check("native composition commits a long Chinese query", () -> named(root(), query) != null);
            capture("input"); key(KeyEvent.KEYCODE_DPAD_DOWN);
            activate("gallery-remote-keyboard-A");
            check("remote key edits the same query", () -> queryIs(query + "A"));
            activate("gallery-remote-keyboard-1");
            check("numeric key edits the same query", () -> queryIs(query + "A1"));
            activate("gallery-remote-keyboard-backspace");
            check("backspace removes only the appended character", () -> queryIs(query + "A"));
            activate("gallery-remote-keyboard-clear");
            check("clear keeps the original editor available", () -> {
                AccessibilityNodeInfo field = id(root(), "gallery-query-activate");
                return field != null && "搜索短剧、演员：短剧、演员".contentEquals(field.getContentDescription());
            });
            activate("gallery-sheet-content");
            focus("gallery-settings-save-row-retry");
            check("failed setting exposes its recovery next to the error", () -> named(root(), "设置未能保存，请重试") != null);
            boolean retainedValue = id(root(), "gallery-settings-toggle").isChecked();
            capture("settings-save-error");
            key(KeyEvent.KEYCODE_DPAD_CENTER);
            check("setting recovery removes feedback and retains its value", () -> id(root(), "gallery-settings-save-row-retry") == null
                    && id(root(), "gallery-settings-toggle").isChecked() == retainedValue);
            check("removed recovery hands focus to a usable action", () -> {
                AccessibilityNodeInfo node = root().findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                return node != null && node.isEnabled() && node.isClickable();
            });
            capture("settings-save-recovered");
            if (reduced) {
                activate("gallery-sheet-foundation");
                check("host reports reduced motion", () -> {
                    AccessibilityNodeInfo node = id(root(), "gallery-host-metrics");
                    return node != null && String.valueOf(node.getText()).contains("reduced true");
                });
            }
            capture("complete");
            result.putString("stream", "TV component acceptance: " + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { capture("failure"); } catch (Exception ignored) { }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        } finally { if (activity != null) runner.runOnMainSync(activity::finish); }
    }
}
