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
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;
import java.io.File;
import java.io.FileOutputStream;
import java.util.function.BooleanSupplier;

/** Business UI acceptance on the final preview APK. Data comes only from a loopback test fixture. */
@android.annotation.TargetApi(34) // The acceptance tool pins API 34 and uses its public cache reset.
final class BrowsingAcceptance {
    private final Instrumentation runner;
    private final String appearance;
    private int checks;
    private Activity activity;
    BrowsingAcceptance(Instrumentation runner, String appearance) { this.runner = runner; this.appearance = appearance; }

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
    private AccessibilityNodeInfo root() {
        runner.getUiAutomation().clearCache();
        return runner.getUiAutomation().getRootInActiveWindow();
    }
    private boolean has(String label) { return find(root(), label) != null; }
    private boolean focused(String label) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null) { if (node.isFocused()) return true; node = node.getParent(); }
        return false;
    }
    private boolean identified(String label, String id) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null) { if (id.equals(node.getViewIdResourceName())) return true; node = node.getParent(); }
        return false;
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
    private void screenshot(String name) throws Exception {
        // Local fixture images arrive independently of result text and fade in for 100ms.
        SystemClock.sleep(800);
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
            activity = runner.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("real library continuation", () -> has("选集与详情") && has("重生之后"));
            screenshot("home");
            key(KeyEvent.KEYCODE_DPAD_RIGHT); confirm();
            check("remote opens independent search", () -> has("搜索短剧"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("remote enters input", () -> activity.getCurrentFocus() instanceof EditText);
            runner.sendStringSync("story");
            check("ordinary native input", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && edit.getText().toString().equals("story"); });
            // Isolate synthetic composition from asynchronous suggestions of the installed IME.
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                ((android.view.inputmethod.InputMethodManager) activity.getSystemService(Activity.INPUT_METHOD_SERVICE))
                        .hideSoftInputFromWindow(edit.getWindowToken(), 0);
            });
            SystemClock.sleep(400);
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
                connection.setComposingText("chong", 1);
            });
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("composing text retains focus and vertical keys", () -> activity.getCurrentFocus() instanceof EditText && BaseInputConnection.getComposingSpanStart(((EditText) activity.getCurrentFocus()).getText()) >= 0);
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
                connection.commitText("重生", 1); connection.finishComposingText();
            });
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("plain down exits editing", () -> !(activity.getCurrentFocus() instanceof EditText));
            // Empty discovery exits to the adjacent Search button; populated discovery exits to a chip below.
            key(has("暂无搜索记录") ? KeyEvent.KEYCODE_DPAD_LEFT : KeyEvent.KEYCODE_DPAD_UP);
            check("remote returns from discovery to query input", () -> activity.getCurrentFocus() instanceof EditText);
            key(KeyEvent.KEYCODE_ENTER);
            check("real HTTP search results", () -> has("重生之后"));
            screenshot("search");
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            for (int i = 0; i < 6 && !focused("重生之后"); i++) key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("content focus distinct from navigation", () -> focused("重生之后"));
            confirm();
            check("detail restores saved late segment", () -> has("继续第 59 集") && has("第 59 集") && !has("第 1 集"));
            screenshot("detail");
            click("继续第 59 集");
            check("unimplemented playback is an honest error", () -> has("当前服务暂不支持播放，请稍后重试。"));
            key(KeyEvent.KEYCODE_BACK);
            check("first back hides playback controls", () -> has("显示播放控制") && !has("下一集"));
            key(KeyEvent.KEYCODE_BACK);
            check("system back returns to detail", () -> has("第 59 集"));
            key(KeyEvent.KEYCODE_BACK);
            check("back restores search source focus", () -> focused("重生之后") && has("加载更多"));
            for (int i = 0; i < 14; i++) key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("remote scrolls recycled horizontal results", () -> !focused("重生之后") && has("重生之后 15"));
            confirm();
            check("recycled item keeps its own identity", () -> has("开始观看") && !has("继续第 59 集"));
            key(KeyEvent.KEYCODE_BACK);
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("remote reaches continuation", () -> focused("加载更多"));
            confirm();
            check("continuation pending is visible", () -> has("正在加载…"));
            check("failed continuation retains retry focus", () -> has("加载失败：合成分页失败") && focused("重试") && has("重生之后 15"));
            screenshot("pagination-error");
            confirm();
            check("remote retries the same continuation", () -> has("正在加载…"));
            check("continuation recovers", () -> has("加载更多") && !has("加载失败：合成分页失败"));
            key(KeyEvent.KEYCODE_DPAD_UP);
            for (int i = 0; i < 55 && !focused("重生之后 64"); i++) key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("remote reaches appended identity", () -> focused("重生之后 64") && identified("重生之后 64", "drama-186"));
            screenshot("pagination-append");
            confirm();
            check("appended detail has correct identity", () -> has("重生之后 64") && has("开始观看"));
            key(KeyEvent.KEYCODE_BACK);
            check("appended return restores source", () -> focused("重生之后 64"));
            screenshot("pagination-return");
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("remote reaches terminal continuation", () -> focused("加载更多"));
            confirm();
            check("terminal continuation removes footer without moving the shelf", () -> !has("加载更多") && !has("正在加载…") && has("重生之后 64"));
            check("terminal removal restores selected source focus", () -> focused("重生之后 64"));
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("remote advances into final appended page", () -> focused("重生之后 65"));
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("remote returns to the selected source", () -> focused("重生之后 64"));
            screenshot("pagination-terminal");
            click("清除搜索");
            check("clear query returns to saved keywords", () -> has("最近搜索") && has("story重生"));
            screenshot("recent-populated");
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            for (int i = 0; i < 12 && !focused("story重生"); i++) key(KeyEvent.KEYCODE_DPAD_LEFT);
            check("remote reaches saved keyword", () -> focused("story重生"));
            confirm();
            check("remote keyword executes a real search", () -> has("重生之后") && has("加载更多"));
            click("清除搜索");
            check("keyword remains after query clearing", () -> has("story重生") && has("清空记录"));
            click("清空记录");
            check("failed clear retains committed keyword", () -> has("搜索记录未清空：合成清空失败") && has("story重生") && has("重试清空"));
            screenshot("recent-error");
            click("重试清空");
            check("explicit retry clears keywords", () -> has("暂无搜索记录") && !has("story重生"));
            screenshot("recent-empty");
            click("我的");
            check("history uses the same continuation", () -> has("重生之后 · 第 59 集 · 15 秒"));
            screenshot("history");
            result.putString("stream", "TV browsing acceptance: " + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { screenshot("failure"); } catch (Exception ignored) { /* Preserve the assertion. */ }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
