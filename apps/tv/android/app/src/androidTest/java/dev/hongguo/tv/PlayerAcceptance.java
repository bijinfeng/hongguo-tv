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
import android.widget.EditText;
import java.io.File;
import java.io.FileOutputStream;
import java.util.function.BooleanSupplier;

/** Production shared player and actual TV adapter, with explicit synthetic HTTP/media fixtures. */
@android.annotation.TargetApi(34) // This acceptance runner requires the pinned API 34 TV image.
final class PlayerAcceptance {
    private final Instrumentation runner;
    private final String appearance;
    private int checks;
    PlayerAcceptance(Instrumentation runner, String appearance) { this.runner = runner; this.appearance = appearance; }

    private void check(String name, BooleanSupplier condition) {
        long until = SystemClock.uptimeMillis() + 15000;
        while (!condition.getAsBoolean()) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError(name);
            SystemClock.sleep(100);
        }
        checks++;
        Bundle status = new Bundle(); status.putString("stream", "PASS " + name + "\n"); runner.sendStatus(0, status);
    }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label) {
        if (node == null || !node.isVisibleToUser()) return null;
        if ((node.getText() != null && node.getText().toString().equals(label))
                || (node.getContentDescription() != null && node.getContentDescription().toString().equals(label))) return node;
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo found = find(node.getChild(i), label); if (found != null) return found; }
        return null;
    }
    private String describe(AccessibilityNodeInfo node) {
        if (node == null) return "";
        String result = (node.getText() != null || node.getContentDescription() != null)
                ? String.valueOf(node.getClassName()) + " " + node.getText() + " | " + node.getContentDescription() + " visible=" + node.isVisibleToUser()
                    + " enabled=" + node.isEnabled() + " focused=" + node.isFocused() + "\n" : "";
        if (String.valueOf(node.getClassName()).contains("Dialog") || node.getPaneTitle() != null)
            result += "PANE " + node.getClassName() + " " + node.getPaneTitle() + "\n";
        if (String.valueOf(node.getClassName()).contains("SeekBar")) {
            android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
            AccessibilityNodeInfo.RangeInfo range = node.getRangeInfo();
            result += "RANGE " + bounds + " " + (range == null ? "null" : range.getMin() + "/" + range.getCurrent() + "/" + range.getMax())
                    + " actions=" + node.getActionList() + "\n";
        }
        for (int i = 0; i < node.getChildCount(); i++) result += describe(node.getChild(i));
        return result;
    }
    private AccessibilityNodeInfo root() {
        // The same NSH text node changes every second; cached nodes can retain its old clock.
        runner.getUiAutomation().clearCache();
        return runner.getUiAutomation().getRootInActiveWindow();
    }
    private boolean has(String label) { return find(root(), label) != null; }
    private boolean focused(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null) { if (node.isFocused()) return true; node = node.getParent(); }
        return false;
    }
    private AccessibilityNodeInfo range(AccessibilityNodeInfo node) {
        if (node == null || !node.isVisibleToUser()) return null;
        if ("android.widget.SeekBar".equals(String.valueOf(node.getClassName()))
                && "音量".equals(String.valueOf(node.getContentDescription()))) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = range(node.getChild(i)); if (found != null) return found;
        }
        return null;
    }
    private float volume() {
        AccessibilityNodeInfo node = range(root());
        if (node == null) return -1;
        android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
        // This NSH Android version exposes range actions but no RangeInfo; verify the real thumb moves.
        return bounds.centerX();
    }
    private String time(AccessibilityNodeInfo node) {
        if (node == null) return "";
        if (node.getText() != null && node.getText().toString().matches("\\d{2}:\\d{2} / \\d{2}:\\d{2}")) return node.getText().toString();
        for (int i = 0; i < node.getChildCount(); i++) { String found = time(node.getChild(i)); if (!found.isEmpty()) return found; }
        return "";
    }
    private int position() {
        String time = time(root());
        return time.isEmpty() ? -1 : Integer.parseInt(time.substring(0, 2)) * 60 + Integer.parseInt(time.substring(3, 5));
    }
    private void key(int code) { runner.sendKeyDownUpSync(code); SystemClock.sleep(220); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void click(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null && !node.isClickable()) node = node.getParent();
        if (node == null || !node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("click " + label);
        SystemClock.sleep(300);
    }
    private EditText input(View view) {
        if (view instanceof EditText) return (EditText) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { EditText found = input(((ViewGroup) view).getChildAt(i)); if (found != null) return found; }
        return null;
    }
    private void navigateTo(String label, int direction) {
        for (int i = 0; i < 10 && !focused(label); i++) key(direction);
        if (!focused(label)) throw new AssertionError("remote focus " + label);
    }
    private void screenshot(String name) throws Exception {
        SystemClock.sleep(300);
        File file = new File(runner.getTargetContext().getExternalFilesDir(null), name + "-" + appearance + ".png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            Bitmap image = runner.getUiAutomation().takeScreenshot();
            if (image == null || !image.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new AssertionError("screenshot");
        }
    }
    void run() {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("missing TV launcher");
            Activity activity = runner.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("production browse route", () -> has("找剧"));
            key(KeyEvent.KEYCODE_MEDIA_NEXT); // Must be discarded, never queued for the next player.
            key(KeyEvent.KEYCODE_DPAD_RIGHT); confirm();
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            runner.sendStringSync("story");
            key(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE);
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("native input retains media and caret keys", () -> activity.getCurrentFocus() instanceof EditText
                    && input(activity.getWindow().getDecorView()).getText().toString().equals("story"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); click("搜索");
            check("HTTP fixture result", () -> has("自制媒体验收"));
            click("自制媒体验收");
            check("real detail route", () -> has("开始观看"));
            click("开始观看");
            // A moving media clock is not an idle accessibility tree. Pause, then inspect it.
            SystemClock.sleep(5000);
            key(KeyEvent.KEYCODE_MEDIA_PAUSE);
            check("actual decoder advances first episode", () -> position() >= 1 && has("自制媒体验收 · 第 1 集"));
            key(KeyEvent.KEYCODE_MEDIA_PAUSE);
            check("media pause reveals and focuses paused controls", () -> has("播放") && !has("暂停") && focused("播放"));
            int paused = position(); SystemClock.sleep(1200);
            check("paused media clock is stationary", () -> position() == paused);
            screenshot("paused");
            key(KeyEvent.KEYCODE_BACK);
            check("Back hides controls without leaving", () -> !has("下一集") && has("显示播放控制"));
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("right opens clamped preview", () -> has("确认播放位置") && position() == Math.min(12, paused + 10));
            screenshot("preview");
            key(KeyEvent.KEYCODE_BACK); confirm();
            check("Back cancels preview without seeking", () -> has("播放") && position() == paused);
            key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("left previews zero", () -> has("确认播放位置") && position() == 0);
            confirm();
            check("confirm commits seek and keeps pause", () -> position() == 0 && has("播放"));
            key(KeyEvent.KEYCODE_MEDIA_PLAY); key(KeyEvent.KEYCODE_MEDIA_PLAY);
            check("explicit media play is idempotent", () -> position() >= 1 && has("暂停"));
            key(KeyEvent.KEYCODE_MEDIA_PAUSE); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
            check("explicit media pause is idempotent", () -> has("播放") && !has("暂停"));
            key(KeyEvent.KEYCODE_MEDIA_REWIND);
            check("media rewind clamps at zero", () -> position() == 0);
            key(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD);
            check("media fast forward applies seek", () -> position() == 10 && has("播放"));
            navigateTo("更多", KeyEvent.KEYCODE_DPAD_RIGHT); confirm();
            check("DPAD opens named settings", () -> has("播放设置") && has("倍速") && has("清晰度") && has("音量"));
            for (int i = 0; i < 6; i++) {
                AccessibilityNodeInfo slider = range(root());
                if (slider != null && slider.isFocused()) break;
                key(KeyEvent.KEYCODE_DPAD_DOWN);
            }
            float beforeVolume = volume();
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("DPAD adjusts the semantic volume range", () -> volume() >= 0 && volume() < beforeVolume);
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            navigateTo("播放速度", KeyEvent.KEYCODE_DPAD_UP); confirm();
            navigateTo("1.5×", KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("DPAD selects playback speed", () -> has("1.5×") && !has("0.75×") && has("播放设置"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("DPAD opens the nested quality selector", () -> has("720P"));
            key(KeyEvent.KEYCODE_BACK);
            check("Back closes only the nested selector", () -> has("播放设置") && !has("720P"));
            screenshot("settings");
            key(KeyEvent.KEYCODE_MEDIA_NEXT); key(KeyEvent.KEYCODE_ESCAPE);
            check("Escape closes settings and restores trigger", () -> !has("播放设置") && focused("更多") && has("自制媒体验收 · 第 1 集"));
            navigateTo("选集", KeyEvent.KEYCODE_DPAD_LEFT); confirm();
            key(KeyEvent.KEYCODE_BACK);
            check("Back closes episode panel and restores trigger", () -> !has("关闭选集") && focused("选集"));
            key(KeyEvent.KEYCODE_MEDIA_NEXT);
            check("media next changes one episode and disables locked successor", () -> {
                AccessibilityNodeInfo next = find(root(), "下一集");
                return has("自制媒体验收 · 第 2 集") && position() >= 1 && next != null && !next.isEnabled();
            });
            key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_ESCAPE);
            if (!has("开始观看")) throw new AssertionError("layered Back/Escape returns to original detail");
            result.putString("stream", "TV player acceptance: " + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { screenshot("failure"); } catch (Exception ignored) { /* Preserve the assertion. */ }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n"
                    + describe(root()));
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
