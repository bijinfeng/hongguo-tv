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
import android.view.inputmethod.InputMethodManager;
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
    private AccessibilityNodeInfo findId(AccessibilityNodeInfo node, String id) {
        return findId(node, id, true);
    }
    private AccessibilityNodeInfo findId(AccessibilityNodeInfo node, String id, boolean visibleOnly) {
        if (node == null || visibleOnly && !node.isVisibleToUser()) return null;
        if (id.equals(node.getViewIdResourceName())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = findId(node.getChild(i), id, visibleOnly);
            if (found != null) return found;
        }
        return null;
    }
    private boolean focusedId(String id) {
        AccessibilityNodeInfo node = findId(root(), id);
        return node != null && node.isFocused();
    }
    private boolean identified(String label, String id) {
        AccessibilityNodeInfo node = find(root(), label);
        while (node != null) { if (id.equals(node.getViewIdResourceName())) return true; node = node.getParent(); }
        return false;
    }
    private void key(int code) { runner.sendKeyDownUpSync(code); SystemClock.sleep(220); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void checkClearFailure() {
        long until = SystemClock.uptimeMillis() + 15000;
        while (!has("搜索记录未清空：服务暂时不可用，请稍后重试")) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError("clear failure stays in its dialog");
            SystemClock.sleep(100);
        }
    }
    private boolean scroll(AccessibilityNodeInfo node, int action) {
        if (node == null) return false;
        if (node.isScrollable() && node.performAction(action)) return true;
        for (int i = 0; i < node.getChildCount(); i++) if (scroll(node.getChild(i), action)) return true;
        return false;
    }
    private AccessibilityNodeInfo visibleTarget(String region, String id) {
        return visibleTarget(root(), region, id);
    }
    private AccessibilityNodeInfo visibleTarget(AccessibilityNodeInfo window, String region, String id) {
        AccessibilityNodeInfo viewport = region == null ? window : findId(window, region);
        AccessibilityNodeInfo node = findId(window, id);
        if (viewport == null || node == null) return null;
        android.graphics.Rect area = new android.graphics.Rect();
        android.graphics.Rect frame = new android.graphics.Rect();
        android.graphics.Rect bounds = new android.graphics.Rect();
        viewport.getBoundsInScreen(area); window.getBoundsInScreen(frame); node.getBoundsInScreen(bounds);
        return area.intersect(frame) && area.contains(bounds.centerX(), bounds.centerY()) ? node : null;
    }
    private String firstVisibleAction(AccessibilityNodeInfo node, android.graphics.Rect area) {
        if (node == null) return "";
        android.graphics.Rect bounds = new android.graphics.Rect(); node.getBoundsInScreen(bounds);
        if (node.isVisibleToUser() && node.isClickable() && area.contains(bounds.centerX(), bounds.centerY())) {
            String id = node.getViewIdResourceName();
            return (id == null ? String.valueOf(node.getContentDescription()) : id) + bounds.toShortString();
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            String found = firstVisibleAction(node.getChild(i), area);
            if (!found.isEmpty()) return found;
        }
        return "";
    }
    private String viewportPosition(AccessibilityNodeInfo window, String region) {
        AccessibilityNodeInfo viewport = region == null ? window : findId(window, region);
        if (viewport == null) return "";
        android.graphics.Rect area = new android.graphics.Rect(); viewport.getBoundsInScreen(area);
        return firstVisibleAction(viewport, area);
    }
    private AccessibilityNodeInfo revealMounted(AccessibilityNodeInfo window, String region, String id) {
        AccessibilityNodeInfo mounted = findId(window, id, false);
        if (mounted == null || !mounted.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId())) return null;
        long until = SystemClock.uptimeMillis() + 1500;
        AccessibilityNodeInfo node;
        do {
            SystemClock.sleep(50);
            node = visibleTarget(region, id);
        } while (node == null && SystemClock.uptimeMillis() < until);
        return node;
    }
    private void focusIn(String region, String id) {
        key(KeyEvent.KEYCODE_DPAD_DOWN); // New directional intent cancels queued restoration before selecting a stop.
        AccessibilityNodeInfo window = root();
        AccessibilityNodeInfo node = visibleTarget(window, region, id);
        if (node == null) node = revealMounted(window, region, id);
        if (node == null && region != null) {
            for (int attempt = 0; attempt < 40; attempt++) {
                if (!scroll(findId(root(), region), AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) break;
                SystemClock.sleep(80);
            }
            window = root();
            node = visibleTarget(window, region, id);
        }
        String position = viewportPosition(window, region);
        long stalledUntil = SystemClock.uptimeMillis() + 5000;
        // Larger text needs more pages; bound traversal and fail if the viewport stops progressing.
        for (int page = 0; node == null && page < 64 && SystemClock.uptimeMillis() < stalledUntil; page++) {
            // A mounted offscreen cell can be revealed, but must not be focused until it is visible.
            node = revealMounted(window, region, id);
            if (node != null) break;
            scroll(region == null ? window : findId(window, region), AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
            SystemClock.sleep(180);
            window = root();
            node = visibleTarget(window, region, id);
            String nextPosition = viewportPosition(window, region);
            if (!nextPosition.equals(position)) {
                position = nextPosition;
                stalledUntil = SystemClock.uptimeMillis() + 5000;
            }
        }
        if (node != null) node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SHOW_ON_SCREEN.getId());
        SystemClock.sleep(200);
        node = visibleTarget(region, id);
        if (node == null || (!node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)))
            throw new AssertionError("focus " + id + " in " + region + " at " + position);
        SystemClock.sleep(200);
        if (!focusedId(id)) throw new AssertionError("keyboard focus " + id);
    }
    private void revealLabelIn(String region, String label) {
        for (int page = 0; page < 16 && !has(label); page++) {
            if (!scroll(findId(root(), region), AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) break;
            SystemClock.sleep(150);
        }
    }
    private void focusAndConfirm(String id) {
        focusIn(null, id);
        confirm();
    }
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
    private void hideKeyboard() {
        runner.runOnMainSync(() -> {
            EditText edit = input(activity.getWindow().getDecorView());
            if (edit != null) ((InputMethodManager) activity.getSystemService(Activity.INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(edit.getWindowToken(), 0);
        });
        long until = SystemClock.uptimeMillis() + 3000;
        while (activity.getWindow().getDecorView().getRootWindowInsets().isVisible(android.view.WindowInsets.Type.ime())) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError("soft keyboard did not close");
            SystemClock.sleep(50);
        }
    }
    private void dump(View view, StringBuilder text, String indent) {
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        int[] origin = new int[2]; view.getLocationOnScreen(origin);
        android.graphics.Rect frame = new android.graphics.Rect(origin[0], origin[1], origin[0] + view.getWidth(), origin[1] + view.getHeight());
        text.append(indent).append(view.getClass().getSimpleName())
            .append(" shown=").append(view.isShown()).append(" enabled=").append(view.isEnabled())
            .append(" alpha=").append(view.getAlpha()).append(" important=").append(view.getImportantForAccessibility())
            .append(" focused=").append(view.isFocused()).append(" id=").append(node.getViewIdResourceName())
            .append(" frame=").append(frame.toShortString()).append(" scrollY=").append(view.getScrollY())
            .append(" canScrollDown=").append(view.canScrollVertically(1)).append(" axVisible=").append(node.isVisibleToUser())
            .append(" label=").append(node.getContentDescription()).append(" text=").append(node.getText()).append('\n');
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++)
            dump(((ViewGroup) view).getChildAt(i), text, indent + "  ");
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
    void runCategory() {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            activity = runner.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("category production entry", () -> has("精选") && has("找剧"));
            key(KeyEvent.KEYCODE_DPAD_RIGHT); confirm();
            check("real category summaries and three named selectors", () -> has("重生之后") && has("类型") && has("题材") && has("排序"));
            screenshot("category");
            focusAndConfirm("filter-category_dim_theme-trigger");
            check("topic popup has real choices", () -> has("悬疑") && has("很长的题材选项仍然可以完整阅读"));
            screenshot("category-popup");
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("remote topic selects exact service id", () -> has("重生之后 51") && has("悬疑"));
            check("topic popup returns trigger focus", () -> focused("悬疑"));
            focusAndConfirm("filter-sort-trigger");
            check("sort has honest latest and popularity", () -> has("最新") && has("热度") && !has("最高收藏"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("latest selection restores trigger", () -> focusedId("filter-sort-trigger") && has("最新") && has("重生之后 51"));
            focusAndConfirm("filter-sort-trigger"); key(KeyEvent.KEYCODE_BACK);
            check("remote Back dismisses selector to trigger", () -> focusedId("filter-sort-trigger") && !has("综合"));
            key(KeyEvent.KEYCODE_DPAD_LEFT); confirm(); key(KeyEvent.KEYCODE_BACK);
            check("newer remote target survives subsequent popup layout", () -> focusedId("filter-category_dim_theme-trigger"));
            focusAndConfirm("drama-173");
            check("category card opens exact detail", () -> has("第 1 集") && has("重生之后 51"));
            key(KeyEvent.KEYCODE_BACK);
            check("category detail returns exact source", () -> focusedId("drama-173"));
            for (int i = 0; i < 14; i++) key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("category shelf recycles to later exact card", () -> focusedId("drama-187"));
            confirm();
            check("later category identity stays exact", () -> has("第 1 集") && has("重生之后 65"));
            key(KeyEvent.KEYCODE_BACK);
            check("later category return restores exact card", () -> focusedId("drama-187"));
            click("搜索短剧");
            check("independent search keeps category return", () -> has("返回找剧") && has("搜索短剧、演员"));
            runner.runOnMainSync(() -> { EditText edit = input(activity.getWindow().getDecorView()); edit.requestFocus(); edit.setText("完整草稿"); });
            hideKeyboard();
            check("category search opens typed suggestions", () -> findId(root(), "search-suggestions") != null);
            key(KeyEvent.KEYCODE_BACK);
            check("remote Back closes suggestions before category navigation", () -> has("返回找剧") && findId(root(), "search-suggestions") == null);
            click("返回找剧");
            check("search returns retained category and exact focus", () -> focusedId("drama-187") && has("悬疑") && has("最新"));
            screenshot("category-return");
            click("加载更多");
            check("category continuation failure retains cards", () -> has("重试加载更多") && has("重生之后 65"));
            screenshot("category-error");
            click("重试加载更多");
            check("empty advancing page still permits continuation", () -> has("加载更多") && !has("重试加载更多"));
            click("加载更多");
            check("terminal page retains ordered cards", () -> !has("加载更多") && !has("正在加载…") && has("悬疑"));
            click("类型"); click("漫剧");
            check("type resets topic and pages", () -> has("漫剧") && has("题材") && has("重生之后 101"));
            click("题材"); click("家庭");
            check("category empty state remains explicit", () -> has("没有找到相关短剧，试试其他筛选。") && !has("加载更多"));
            screenshot("category-empty");
            focusAndConfirm("category-clear");
            check("clear resets all category dimensions", () -> has("重生之后") && has("全部类型") && has("全部题材") && has("综合排序"));
            click("搜索短剧");
            check("clear leaves independent search draft intact", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && "完整草稿".contentEquals(edit.getText()); });
            result.putString("stream", "TV category acceptance: " + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { screenshot("failure"); } catch (Exception ignored) { /* Keep assertion. */ }
            try {
                StringBuilder tree = new StringBuilder();
                runner.runOnMainSync(() -> dump(activity.getWindow().getDecorView(), tree, ""));
                try (FileOutputStream out = new FileOutputStream(new File(runner.getTargetContext().getExternalFilesDir(null), "failure-" + appearance + ".txt"))) {
                    out.write(tree.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            } catch (Exception ignored) { /* Keep assertion. */ }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
    void run() { run(false); }
    void run(boolean typedOnly) {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("missing TV launcher");
            activity = runner.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            focusIn("home-scroll", "home-continue-123");
            check("fixture continuation preserves its saved identity", () -> focusedId("home-continue-123")
                    && identified("重生之后 · 第 59 集 · 00:15", "home-continue-123"));
            screenshot("home");
            if (!typedOnly) {
            click("搜索短剧");
            check("remote opens independent search", () -> has("搜索短剧、演员"));
            check("remote enters input", () -> activity.getCurrentFocus() instanceof EditText);
            runner.sendStringSync("story");
            check("ordinary native input", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && edit.getText().toString().equals("story"); });
            // Isolate synthetic composition from asynchronous suggestions of the installed IME.
            hideKeyboard();
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
            key(KeyEvent.KEYCODE_DPAD_UP);
            check("remote returns from keyboard to query input", () -> activity.getCurrentFocus() instanceof EditText);
            key(KeyEvent.KEYCODE_ENTER);
            check("real HTTP search results", () -> has("重生之后"));
            screenshot("search");
            focusIn("results", "drama-123");
            check("content focus distinct from navigation", () -> focused("重生之后"));
            AccessibilityNodeInfo cover = find(findId(root(), "drama-123"), "重生之后封面");
            if (cover == null) throw new AssertionError("poster cover exists for pointer activation");
            android.graphics.Rect coverBounds = new android.graphics.Rect();
            cover.getBoundsInScreen(coverBounds);
            long touchStart = SystemClock.uptimeMillis();
            runner.runOnMainSync(() -> {
                long now = SystemClock.uptimeMillis();
                android.view.MotionEvent down = android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, coverBounds.centerX(), coverBounds.centerY(), 0);
                android.view.MotionEvent up = android.view.MotionEvent.obtain(now, now + 10, android.view.MotionEvent.ACTION_UP, coverBounds.centerX(), coverBounds.centerY(), 0);
                activity.dispatchTouchEvent(down); activity.dispatchTouchEvent(up);
                down.recycle(); up.recycle();
            });
            check("poster artwork activates its owning card without blocking input", () -> has("继续第 59 集") && SystemClock.uptimeMillis() - touchStart < 2000);
            focusIn("detail-scroll", "episode-1058");
            check("detail restores saved late segment", () -> has("第 59 集") && !has("第 1 集"));
            screenshot("detail");
            focusIn("detail-scroll", "detail-start");
            confirm();
            check("unimplemented playback is an honest error", () -> has("当前服务暂不支持播放，请稍后重试。"));
            key(KeyEvent.KEYCODE_BACK);
            check("failed playback Back returns directly to detail", () -> has("继续第 59 集") && findId(root(), "detail-scroll") != null);
            focusIn("detail-scroll", "episode-1058");
            check("failed playback return retains the saved late segment", () -> has("第 59 集") && !has("第 1 集"));
            check("failure exit leaves no playback action behind", () -> !has("显示播放控制") && !has("当前服务暂不支持播放，请稍后重试。"));
            key(KeyEvent.KEYCODE_BACK);
            check("back restores search source focus", () -> focused("重生之后") && has("加载更多"));
            focusIn("results", "drama-137");
            check("native grid reveals recycled later results", () -> focused("重生之后 15"));
            confirm();
            check("recycled item keeps its own identity", () -> has("开始观看") && !has("继续第 59 集"));
            key(KeyEvent.KEYCODE_BACK);
            focusIn(null, "search-more");
            check("remote reaches continuation", () -> focused("加载更多"));
            confirm();
            check("continuation pending is visible", () -> has("正在加载…"));
            check("failed continuation retains retry focus", () -> has("加载失败：服务暂时不可用，请稍后重试") && focused("重试") && findId(root(), "results") != null);
            screenshot("pagination-error");
            focusIn("results", "drama-137");
            check("failed continuation keeps the exact loaded identity", () -> focused("重生之后 15") && identified("重生之后 15", "drama-137"));
            focusIn(null, "search-more");
            confirm();
            check("remote retries the same continuation", () -> has("正在加载…"));
            check("continuation recovers", () -> has("加载更多") && !has("加载失败：服务暂时不可用，请稍后重试"));
            focusIn("results", "drama-186");
            check("remote reaches appended identity", () -> focused("重生之后 64") && identified("重生之后 64", "drama-186"));
            screenshot("pagination-append");
            confirm();
            check("appended detail has correct identity", () -> has("重生之后 64") && has("开始观看"));
            key(KeyEvent.KEYCODE_BACK);
            check("appended return restores source", () -> focused("重生之后 64"));
            screenshot("pagination-return");
            focusIn(null, "search-more");
            check("remote reaches terminal continuation", () -> focused("加载更多"));
            confirm();
            check("terminal continuation removes footer without moving the shelf", () -> !has("加载更多") && !has("正在加载…") && has("重生之后 64"));
            check("terminal removal returns to the retained query editor", () -> activity.getCurrentFocus() instanceof EditText
                    && "story重生".contentEquals(((EditText) activity.getCurrentFocus()).getText()));
            focusIn("results", "drama-187");
            check("final appended grid page remains reachable", () -> focused("重生之后 65"));
            focusIn("results", "drama-186");
            check("selected grid source remains reachable", () -> focused("重生之后 64"));
            screenshot("pagination-terminal");
            click("清除搜索");
            focusIn("search-editor-scroll", "recent-search-story重生");
            check("clear query returns to saved keywords", () -> has("最近搜索") && has("story重生"));
            screenshot("recent-populated");
            check("remote reaches saved keyword", () -> focused("story重生"));
            confirm();
            check("remote keyword executes a real search", () -> has("重生之后") && has("加载更多"));
            click("清除搜索");
            focusIn("search-editor-scroll", "recent-search-story重生");
            check("keyword remains after query clearing", () -> has("story重生") && has("清空搜索记录"));
            click("清空搜索记录");
            focusAndConfirm("clear-recent-confirm-confirm");
            checkClearFailure();
            key(KeyEvent.KEYCODE_BACK);
            hideKeyboard();
            SystemClock.sleep(300);
            revealLabelIn("search-editor-scroll", "搜索记录未清空：服务暂时不可用，请稍后重试");
            check("failed clear keeps its error visible", () -> has("搜索记录未清空：服务暂时不可用，请稍后重试"));
            focusIn("search-editor-scroll", "recent-search-story重生");
            check("failed clear retains committed keyword", () -> has("story重生"));
            revealLabelIn("search-editor-scroll", "重试清空");
            check("failed clear keeps its retry reachable", () -> has("重试清空"));
            screenshot("recent-error");
            click("重试清空");
            revealLabelIn("search-editor-scroll", "暂无搜索记录");
            check("explicit retry clears keywords", () -> has("暂无搜索记录") && !has("story重生"));
            screenshot("recent-empty");
            check("anonymous discovery retains approved story shelf", () -> has("试试这些故事") && has("山海归来") && has("重生之后 41"));
            hideKeyboard();
            screenshot("discovery");
            focusIn("results", "drama-163");
            check("remote focuses first discovery source", () -> focused("重生之后 41"));
            confirm();
            check("discovery exact card opens detail", () -> has("重生之后 41") && has("开始观看"));
            key(KeyEvent.KEYCODE_BACK);
            check("discovery return restores first source", () -> focused("重生之后 41"));
            key(KeyEvent.KEYCODE_DPAD_RIGHT);
            check("returned source yields to new remote focus", () -> focused("重生之后 42"));
            SystemClock.sleep(500);
            check("late discovery does not steal moved focus", () -> focused("重生之后 42"));
            focusIn("results", "drama-174");
            check("remote reaches last discovery identity", () -> focused("重生之后 52") && identified("重生之后 52", "drama-174"));
            confirm();
            check("last discovery identity opens its detail", () -> has("重生之后 52") && has("开始观看"));
            key(KeyEvent.KEYCODE_BACK);
            check("last discovery return restores source", () -> focused("重生之后 52"));
            screenshot("discovery-return");
            focusAndConfirm("discovery-query-山海归来");
            check("discovery keyword executes ordinary search", () -> has("重生之后") && has("加载更多"));
            check("discovery keyword preserves input identity", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && edit.getText().toString().equals("山海归来"); });
            screenshot("discovery-keyword");
            click("我的");
            focusAndConfirm("mine-history");
            check("history uses the same continuation", () -> has("重生之后 · 第 59 集 · 00:15"));
            screenshot("history");
            }
            click("搜索短剧");
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                edit.requestFocus(); edit.setText("");
                InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
                connection.setComposingText("lin", 1);
            });
            SystemClock.sleep(500);
            check("typed composition keeps suggestions closed", () -> {
                EditText edit = input(activity.getWindow().getDecorView());
                return edit != null && BaseInputConnection.getComposingSpanStart(edit.getText()) >= 0
                        && !has("林初") && activity.getCurrentFocus() instanceof EditText;
            });
            runner.runOnMainSync(() -> {
                EditText edit = input(activity.getWindow().getDecorView());
                InputConnection connection = edit.onCreateInputConnection(new EditorInfo());
                connection.commitText("林", 1); connection.finishComposingText();
            });
            check("committed native input opens typed suggestions", () -> has("林初") && has("演员"));
            hideKeyboard();
            screenshot("typed-suggestions");
            StringBuilder before = new StringBuilder();
            runner.runOnMainSync(() -> dump(activity.getWindow().getDecorView(), before, ""));
            try (FileOutputStream out = new FileOutputStream(new File(runner.getTargetContext().getExternalFilesDir(null), "typed-before-" + appearance + ".txt"))) { out.write(before.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); }
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("remote enters actor suggestion", () -> focusedId("suggestion-actor:9007199254740993"));
            confirm();
            check("actor route shows its named works", () -> has("林初") && has("用故事连接每一种生活。") && has("重生之后"));
            screenshot("actor");
            click("重生之后");
            check("actor first work uses exact saved identity", () -> has("继续第 59 集") && has("重生之后"));
            key(KeyEvent.KEYCODE_BACK);
            check("actor detail returns exact first work focus", () -> focused("重生之后") && has("林初"));
            focusIn("actor-results", "drama-137");
            check("actor grid recycles to exact later work", () -> focused("重生之后 15") && identified("重生之后 15", "drama-137"));
            confirm();
            check("later actor work opens own detail", () -> has("重生之后 15") && has("开始观看") && !has("继续第 59 集"));
            key(KeyEvent.KEYCODE_BACK);
            check("actor return preserves later source focus", () -> focused("重生之后 15"));
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            SystemClock.sleep(500);
            check("newer remote movement wins actor return", () -> focused("重生之后 14"));
            screenshot("actor-return");
            key(KeyEvent.KEYCODE_BACK);
            check("actor back restores source suggestion", () -> focusedId("suggestion-actor:9007199254740993") && has("演员"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("drama suggestion opens explicit detail", () -> has("重生之后") && has("继续第 59 集"));
            key(KeyEvent.KEYCODE_BACK);
            check("drama back restores exact suggestion", () -> focusedId("suggestion-drama:123") && has("演员"));
            key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("keyword suggestion submits visible name", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && edit.getText().toString().equals("山海归来") && has("加载更多"); });
            key(KeyEvent.KEYCODE_DPAD_UP);
            runner.runOnMainSync(() -> { EditText edit = input(activity.getWindow().getDecorView()); edit.requestFocus(); edit.setText("林"); });
            check("typed suggestions reopen after ordinary search", () -> has("林初"));
            hideKeyboard(); focusAndConfirm("suggestion-query:" + "词".repeat(81));
            check("long keyword stays whole editable and invalid", () -> { EditText edit = input(activity.getWindow().getDecorView()); return edit != null && edit.hasFocus() && edit.getText().length() == 81 && has("搜索内容过长，请缩短后重试。") && !has("演员"); });
            hideKeyboard(); screenshot("typed-validation");
            runner.runOnMainSync(() -> { EditText edit = input(activity.getWindow().getDecorView()); edit.setText("缩短"); });
            key(KeyEvent.KEYCODE_ENTER);
            check("shortened invalid keyword recovers search", () -> has("加载更多") && !has("搜索内容过长，请缩短后重试。"));
            runner.runOnMainSync(() -> { EditText edit = input(activity.getWindow().getDecorView()); edit.requestFocus(); edit.setText("建议失败"); });
            check("typed error keeps input available", () -> has("建议未能加载") && has("重试"));
            key(KeyEvent.KEYCODE_DPAD_DOWN);
            check("typed retry reachable by remote", () -> focused("重试"));
            confirm();
            check("typed retry preserves recoverable failure", () -> has("建议未能加载"));
            // Android owns the soft keyboard's Back before the application's overlay stack.
            hideKeyboard();
            key(KeyEvent.KEYCODE_BACK);
            check("system back dismisses suggestion before page", () -> !has("建议未能加载") && has("加载更多"));
            screenshot("typed-dismissed");
            runner.runOnMainSync(() -> { EditText edit = input(activity.getWindow().getDecorView()); edit.requestFocus(); edit.setText("林"); });
            check("pointer return starts with actor suggestion", () -> has("林初"));
            hideKeyboard(); key(KeyEvent.KEYCODE_DPAD_DOWN); confirm();
            check("pointer return starts on actor works", () -> has("用故事连接每一种生活。"));
            runner.runOnMainSync(activity::onBackPressed);
            long homeDeadline = SystemClock.uptimeMillis() + 15000;
            AccessibilityNodeInfo homeEntry = find(root(), "精选");
            while (homeEntry == null && SystemClock.uptimeMillis() < homeDeadline) {
                SystemClock.sleep(10);
                homeEntry = find(root(), "精选");
            }
            if (homeEntry == null) throw new AssertionError("root header returns before pointer navigation");
            android.graphics.Rect home = new android.graphics.Rect();
            homeEntry.getBoundsInScreen(home);
            runner.runOnMainSync(() -> {
                long now = SystemClock.uptimeMillis();
                android.view.MotionEvent down = android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, home.centerX(), home.centerY(), 0);
                android.view.MotionEvent up = android.view.MotionEvent.obtain(now, now + 10, android.view.MotionEvent.ACTION_UP, home.centerX(), home.centerY(), 0);
                activity.dispatchTouchEvent(down); activity.dispatchTouchEvent(up);
                down.recycle(); up.recycle();
            });
            SystemClock.sleep(600);
            check("newer pointer navigation wins pending actor return", () -> findId(root(), "browse-section-home") != null && !has("用故事连接每一种生活。") && !has("演员"));
            result.putString("stream", (typedOnly ? "TV suggestions acceptance: " : "TV browsing acceptance: ") + checks + " checks passed\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { screenshot("failure"); } catch (Exception ignored) { /* Preserve the assertion. */ }
            try {
                StringBuilder tree = new StringBuilder();
                runner.runOnMainSync(() -> dump(activity.getWindow().getDecorView(), tree, ""));
                File file = new File(runner.getTargetContext().getExternalFilesDir(null), "failure-" + appearance + ".txt");
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(tree.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
            } catch (Exception ignored) { /* Preserve the assertion. */ }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
