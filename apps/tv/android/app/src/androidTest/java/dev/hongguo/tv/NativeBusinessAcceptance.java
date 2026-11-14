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
import org.json.JSONArray;
import org.json.JSONObject;

/** Installed native production core, public catalog and actual media; no HTTP fixture. */
@android.annotation.TargetApi(34)
final class NativeBusinessAcceptance {
    private final Instrumentation runner;
    private final String appearance;
    private final String phase;
    private int checks;
    private boolean mediaRetried;
    private Activity activity;
    NativeBusinessAcceptance(Instrumentation runner, String appearance, String phase) {
        this.runner = runner; this.appearance = appearance; this.phase = phase;
    }
    private void check(String name, BooleanSupplier condition) {
        long until = SystemClock.uptimeMillis() + 60000;
        while (!condition.getAsBoolean()) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError(name);
            SystemClock.sleep(150);
        }
        passed(name);
    }
    private void verify(String name, boolean condition) {
        if (!condition) throw new AssertionError(name);
        passed(name);
    }
    private void passed(String name) {
        checks++;
        Bundle status = new Bundle(); status.putString("stream", "PASS " + name + "\n"); runner.sendStatus(0, status);
    }
    private AccessibilityNodeInfo root() {
        runner.getUiAutomation().clearCache();
        return runner.getUiAutomation().getRootInActiveWindow();
    }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (label.contentEquals(node.getText() == null ? "" : node.getText())
                || label.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())) return node;
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo found = find(node.getChild(i), label); if (found != null) return found; }
        return null;
    }
    private AccessibilityNodeInfo firstResult(AccessibilityNodeInfo node) {
        if (node == null || !node.isVisibleToUser()) return null;
        String id = node.getViewIdResourceName();
        if (id != null && id.startsWith("drama-") && node.isClickable()) return node;
        for (int i = 0; i < node.getChildCount(); i++) { AccessibilityNodeInfo found = firstResult(node.getChild(i)); if (found != null) return found; }
        return null;
    }
    private boolean has(String label) { return find(root(), label) != null; }
    private boolean enabled(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        return node != null && node.isEnabled() && node.isClickable();
    }
    private boolean focused(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null) { if (node.isFocused()) return true; node = node.getParent(); }
        return false;
    }
    private String clock(AccessibilityNodeInfo node) {
        if (node == null) return "";
        if (node.getText() != null && node.getText().toString().matches("\\d{2}:\\d{2} / \\d{2}:\\d{2}")) return node.getText().toString();
        for (int i = 0; i < node.getChildCount(); i++) { String found = clock(node.getChild(i)); if (!found.isEmpty()) return found; }
        return "";
    }
    private int position() {
        String value = clock(root());
        return value.isEmpty() ? -1 : Integer.parseInt(value.substring(0, 2)) * 60 + Integer.parseInt(value.substring(3, 5));
    }
    private void key(int code) { runner.sendKeyDownUpSync(code); SystemClock.sleep(250); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void click(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null && !node.isClickable()) node = node.getParent();
        if (node == null || !node.isEnabled() || !node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) throw new AssertionError("click " + label);
        SystemClock.sleep(300);
    }
    private EditText input(View view) {
        if (view instanceof EditText) return (EditText) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) { EditText found = input(((ViewGroup) view).getChildAt(i)); if (found != null) return found; }
        return null;
    }
    private void capture(String name) throws Exception {
        File directory = runner.getTargetContext().getExternalFilesDir(null);
        String stem = "native-" + phase + "-" + name + "-" + appearance;
        try (FileOutputStream out = new FileOutputStream(new File(directory, stem + ".png"))) {
            Bitmap image = runner.getUiAutomation().takeScreenshot();
            if (image == null || !image.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new AssertionError("screenshot");
        }
        Files.write(new File(directory, stem + ".json").toPath(), describe(root()).toString(2).getBytes(StandardCharsets.UTF_8));
    }
    private JSONObject describe(AccessibilityNodeInfo node) throws Exception {
        JSONObject result = new JSONObject();
        if (node == null) return result;
        android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
        result.put("text", String.valueOf(node.getText())); result.put("label", String.valueOf(node.getContentDescription()));
        result.put("id", node.getViewIdResourceName()); result.put("class", String.valueOf(node.getClassName()));
        result.put("bounds", bounds.toShortString()); result.put("visible", node.isVisibleToUser());
        result.put("focused", node.isFocused()); result.put("enabled", node.isEnabled()); result.put("clickable", node.isClickable());
        JSONArray children = new JSONArray();
        for (int i = 0; i < node.getChildCount(); i++) children.put(describe(node.getChild(i)));
        result.put("children", children); return result;
    }
    private File stateFile() { return new File(runner.getTargetContext().getExternalFilesDir(null), "native-state-" + appearance + ".json"); }
    private void awaitClock(String title, int episode, int minimum) throws Exception {
        long until = SystemClock.uptimeMillis() + 60000;
        while (!(position() >= minimum && (enabled("播放") || enabled("暂停")) && has(title + " · 第 " + episode + " 集"))) {
            if (has("播放遇到问题") && enabled("重试")) {
                capture("playback-error-" + (mediaRetried ? "2" : "1"));
                if (mediaRetried) throw new AssertionError("media failed after one UI retry in this phase");
                Bundle status = new Bundle(); status.putString("stream", "RETRY real playback through visible retry button\n"); runner.sendStatus(0, status);
                mediaRetried = true;
                click("重试");
            }
            if (SystemClock.uptimeMillis() > until) throw new AssertionError("real media clock " + title + " episode " + episode);
            SystemClock.sleep(150);
        }
    }
    private void awaitAdvance(int minimum) {
        long until = SystemClock.uptimeMillis() + 8000;
        while (position() < minimum) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError("decoder did not advance within eight seconds");
            SystemClock.sleep(150);
        }
    }
    private int seekFromStart() {
        for (int i = 0; i < 60 && position() > 0; i++) key(KeyEvent.KEYCODE_MEDIA_REWIND);
        if (position() != 0) throw new AssertionError("remote rewind to zero");
        key(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD); key(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD);
        if (position() < 20) throw new AssertionError("episode too short for restart acceptance");
        return position();
    }
    private void leavePlayer() {
        key(KeyEvent.KEYCODE_BACK); key(KeyEvent.KEYCODE_BACK);
        check("layered Back returns to detail", () -> has("继续第 2 集"));
    }
    private void watch(Intent launch) throws Exception {
        for (int i = 0; i < 10 && !focused("搜索短剧"); i++) key(KeyEvent.KEYCODE_DPAD_RIGHT);
        if (!focused("搜索短剧")) throw new AssertionError("remote search tool unreachable");
        confirm();
        check("remote opens search", () -> has("搜索短剧"));
        check("remote enters native input", () -> activity.getCurrentFocus() instanceof EditText);
        runner.runOnMainSync(() -> {
            EditText edit = input(activity.getWindow().getDecorView());
            InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
            connection.setSelection(0, edit.getText().length()); connection.commitText("重生", 1); connection.finishComposingText();
            ((android.view.inputmethod.InputMethodManager) activity.getSystemService(Activity.INPUT_METHOD_SERVICE))
                    .hideSoftInputFromWindow(edit.getWindowToken(), 0);
        });
        SystemClock.sleep(500);
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        check("native input commits Chinese query", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && "重生".contentEquals(edit.getText()); });
        click("搜索");
        check("native core returns real catalog results", () -> firstResult(root()) != null);
        capture("search");
        String title = firstResult(root()).getContentDescription().toString();
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        for (int i = 0; i < 8 && !focused(title); i++) key(KeyEvent.KEYCODE_DPAD_LEFT);
        check("remote focuses first real result", () -> focused(title));
        confirm();
        check("real detail exposes first available episode", () -> has("第 1 集"));
        capture("detail");
        click("第 1 集");
        awaitClock(title, 1, 1); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        check("actual first episode media clock advances", () -> has(title + " · 第 1 集") && position() >= 1 && has("播放"));
        int paused = position(); SystemClock.sleep(1500);
        verify("pause holds actual clock", position() == paused);
        int firstSeek = seekFromStart();
        key(KeyEvent.KEYCODE_MEDIA_PLAY); awaitAdvance(firstSeek + 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        verify("media play resumes actual decoder after seek", position() >= firstSeek + 2);
        capture("paused");
        int beforeHome = position();
        key(KeyEvent.KEYCODE_MEDIA_PLAY); key(KeyEvent.KEYCODE_HOME); SystemClock.sleep(3000);
        runner.getTargetContext().startActivity(launch);
        check("foreground prepares one paused media owner", () -> enabled("播放") && has(title + " · 第 1 集"));
        verify("background stops the actual clock", position() >= beforeHome && position() <= beforeHome + 2);
        key(KeyEvent.KEYCODE_MEDIA_PLAY); awaitAdvance(beforeHome + 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        verify("decoder resumes after foreground", position() >= beforeHome + 2);
        key(KeyEvent.KEYCODE_MEDIA_NEXT);
        awaitClock(title, 2, 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        check("media next loads and decodes real second episode", () -> has(title + " · 第 2 集") && position() >= 2 && has("播放"));
        int sought = seekFromStart();
        key(KeyEvent.KEYCODE_MEDIA_PLAY); awaitAdvance(sought + 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        verify("seek changes actual second-episode decoding", sought >= 20 && position() >= sought + 2);
        capture("next");
        int saved = position();
        leavePlayer(); capture("return");
        key(KeyEvent.KEYCODE_BACK);
        check("return restores real source focus", () -> focused(title));
        click("我的");
        check("native history includes committed second episode", () -> has(title + " · 第 2 集 · " + saved + " 秒"));
        capture("history");
        JSONObject state = new JSONObject(); state.put("title", title); state.put("episode", 2); state.put("position", saved);
        Files.write(stateFile().toPath(), state.toString(2).getBytes(StandardCharsets.UTF_8));
        SystemClock.sleep(1200); // Allow the acknowledged SQLite worker to finish before external force-stop.
    }
    private void resume() throws Exception {
        JSONObject state = new JSONObject(new String(Files.readAllBytes(stateFile().toPath()), StandardCharsets.UTF_8));
        String title = state.getString("title"); int saved = state.getInt("position");
        check("restart retains native continuation", () -> has(title) && has("选集与详情"));
        capture("home"); click("选集与详情");
        check("restart detail retains same episode", () -> has("继续第 2 集"));
        capture("detail"); click("继续第 2 集");
        awaitClock(title, 2, 0);
        verify("restart loads media before measuring seek", enabled("暂停"));
        long started = SystemClock.uptimeMillis();
        awaitAdvance(saved + 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        verify("restart decoder seeks committed position", saved >= 20 && SystemClock.uptimeMillis() - started < 10000 && has("播放") && position() >= saved + 2 && position() <= saved + 10);
        int before = position();
        key(KeyEvent.KEYCODE_MEDIA_PLAY); awaitAdvance(before + 2); key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        verify("resumed real media continues advancing", position() >= before + 2);
        capture("paused"); leavePlayer();
    }
    void run() {
        Bundle result = new Bundle();
        try {
            if (!"watch".equals(phase) && !"resume".equals(phase)) throw new IllegalArgumentException("phase watch|resume required");
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("missing TV launcher");
            activity = runner.startActivitySync(new Intent(launch).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("native production home opens", () -> has("精选") && has("找剧"));
            if ("watch".equals(phase)) watch(launch); else resume();
            result.putString("stream", "TV native business " + phase + ": " + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { capture("failure"); } catch (Exception ignored) { /* Preserve the assertion. */ }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
