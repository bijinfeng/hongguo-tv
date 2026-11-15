package dev.hongguo.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Shared production TSX and real TvRemote on a separate, GET-only acceptance package. */
@android.annotation.TargetApi(34)
public final class RankingsAcceptance extends Instrumentation {
    private static final String WEEKLY = "weekly & raw";
    private static final String ACTOR = "actor/榜 & 9";
    private static final String LATER = "later/榜 & 48";
    private static final String DENSE = "dense/32 & raw";
    private static final String READ_ONLY_ACTOR = "没有演员编号的特别出演与漫长中文姓名";
    private static final String ONLY_ACTOR_NAME = onlyActorName();
    private static final String[] ROOT_CHOICES = { WEEKLY, ACTOR, LATER, DENSE, "" };
    private Bundle arguments;
    private Activity activity;
    private int checks;
    private String appearance;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        this.arguments = arguments;
        appearance = arguments.getString("appearance", "light-identity");
        start();
    }

    private void check(String name, BooleanSupplier condition) {
        long until = SystemClock.uptimeMillis() + 15000;
        while (!condition.getAsBoolean()) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError(name + "; focused=" + focusedIdentity());
            SystemClock.sleep(100);
        }
        checks++;
        Bundle status = new Bundle();
        status.putString("stream", "PASS " + name + "\n");
        sendStatus(0, status);
    }

    private AccessibilityNodeInfo root() {
        getUiAutomation().clearCache();
        return getUiAutomation().getRootInActiveWindow();
    }

    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String id) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (id.equals(node.getViewIdResourceName())) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = find(node.getChild(index), id);
            if (found != null) return found;
        }
        return null;
    }

    private boolean text(AccessibilityNodeInfo node, String value) {
        if (node == null || !node.isVisibleToUser()) return false;
        if (value.equals(String.valueOf(node.getText())) || value.equals(String.valueOf(node.getContentDescription()))) return true;
        for (int index = 0; index < node.getChildCount(); index++)
            if (text(node.getChild(index), value)) return true;
        return false;
    }

    private boolean has(String id) { return find(root(), id) != null; }
    private boolean hasText(String value) { return text(root(), value); }
    private String label(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node == null ? "" : String.valueOf(node.getContentDescription());
    }
    private boolean focused(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node != null && node.isFocused();
    }
    private String focusedIdentity() {
        AccessibilityNodeInfo node = root();
        node = node == null ? null : node.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        return node == null ? "none" : String.valueOf(node.getViewIdResourceName());
    }
    private boolean enabled(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node != null && node.isEnabled();
    }

    private void key(int code) { sendKeyDownUpSync(code); SystemClock.sleep(250); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void back() { key(KeyEvent.KEYCODE_BACK); }

    // A public accessibility focus action establishes a named starting point; presses are real keys.
    private void focus(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        if (node == null || (!node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)))
            throw new AssertionError("focus " + id);
        check("native focus " + id, () -> focused(id));
    }
    private void activate(String id) { focus(id); confirm(); }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8)
            .replace("+", "%20").replace("%21", "!").replace("%27", "'")
            .replace("%28", "(").replace("%29", ")").replace("%7E", "~");
    }
    private static String choice(String group, String value) {
        return "ranking-choice-" + encode(group) + "-" + encode(value);
    }
    private static String ancestors(String... values) {
        JSONArray array = new JSONArray();
        for (String value : values) array.put(value);
        // Android JSON escapes slashes; TSX JSON.stringify keeps opaque selector paths literal.
        return array.toString().replace("\\/", "/");
    }

    /** Scrolling and focus movement use only DPAD, never an accessibility scroll or click. */
    private void walk(String id, int direction, int maximum) {
        for (int index = 0; index < maximum && !focused(id); index++) key(direction);
        check("remote reaches " + id, () -> focused(id));
    }

    private static String onlyActorName() {
        StringBuilder name = new StringBuilder();
        for (int index = 0; index < 7; index++) name.append("只有姓名也应能安静读完的特别出演");
        return name.substring(0, 100);
    }

    /** Font scaling may wrap the reading stop onto another row; use its actual native rectangle. */
    private void walkByGeometry(String id, int maximum) {
        for (int index = 0; index < maximum && !focused(id); index++) {
            Rect to = bounds(id), from = bounds(focusedIdentity());
            if (to.isEmpty()) throw new AssertionError("native target has no geometry: " + id);
            if (from.isEmpty()) {
                // Enter a newly opened page through the remote's ordinary first directional key.
                key(KeyEvent.KEYCODE_DPAD_DOWN);
                continue;
            }
            int direction;
            if (to.top >= from.bottom - 2) direction = KeyEvent.KEYCODE_DPAD_DOWN;
            else if (to.bottom <= from.top + 2) direction = KeyEvent.KEYCODE_DPAD_UP;
            else if (to.left >= from.right - 2) direction = KeyEvent.KEYCODE_DPAD_RIGHT;
            else if (to.right <= from.left + 2) direction = KeyEvent.KEYCODE_DPAD_LEFT;
            else if (Math.abs(to.centerY() - from.centerY()) >= Math.abs(to.centerX() - from.centerX()))
                direction = to.centerY() > from.centerY() ? KeyEvent.KEYCODE_DPAD_DOWN : KeyEvent.KEYCODE_DPAD_UP;
            else direction = to.centerX() > from.centerX() ? KeyEvent.KEYCODE_DPAD_RIGHT : KeyEvent.KEYCODE_DPAD_LEFT;
            key(direction);
        }
        check("geometry-driven remote reaches " + id, () -> focused(id));
    }

    private void selectRoot(String value, String expectedLabel) {
        String id = choice("rank", value);
        if (!has(id)) {
            int target = -1;
            int visible = -1;
            for (int index = 0; index < ROOT_CHOICES.length; index++) {
                if (ROOT_CHOICES[index].equals(value)) target = index;
                if (has(choice("rank", ROOT_CHOICES[index]))) visible = index;
            }
            if (visible < 0 || target < 0) throw new AssertionError("root choices unavailable " + value);
            focus(choice("rank", ROOT_CHOICES[visible]));
            walk(id, visible < target ? KeyEvent.KEYCODE_DPAD_RIGHT : KeyEvent.KEYCODE_DPAD_LEFT, 12);
        } else focus(id);
        check("server root label retained " + value, () -> expectedLabel.equals(label(id)));
        confirm();
    }

    private View nativeView(View view, String id) {
        if (id.equals(view.createAccessibilityNodeInfo().getViewIdResourceName())) return view;
        if (view instanceof ViewGroup)
            for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) {
                View found = nativeView(((ViewGroup) view).getChildAt(index), id);
                if (found != null) return found;
            }
        return null;
    }

    private Rect bounds(String id) {
        Rect rect = new Rect();
        runOnMainSync(() -> {
            View view = nativeView(activity.getWindow().getDecorView(), id);
            if (view == null) return;
            int[] position = new int[2];
            view.getLocationOnScreen(position);
            rect.set(position[0], position[1], position[0] + view.getWidth(), position[1] + view.getHeight());
        });
        return rect;
    }

    private boolean completeWithRing(String id) {
        Rect item = bounds(id);
        Rect viewport = bounds("ranking-results");
        if (item.isEmpty() || viewport.isEmpty()) return false;
        return item.left >= viewport.left + 6 && item.right <= viewport.right - 6
            && item.top >= viewport.top + 6 && item.bottom <= viewport.bottom - 6;
    }

    private JSONObject describe(View view) throws Exception {
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        JSONObject item = new JSONObject();
        Rect visible = new Rect();
        view.getGlobalVisibleRect(visible);
        item.put("class", view.getClass().getName());
        item.put("id", node.getViewIdResourceName());
        item.put("text", node.getText());
        item.put("label", node.getContentDescription());
        item.put("focused", view.isFocused());
        item.put("visible", view.isShown());
        item.put("bounds", visible.toShortString());
        item.put("width", view.getWidth());
        item.put("height", view.getHeight());
        item.put("scrollX", view.getScrollX());
        item.put("scrollY", view.getScrollY());
        if (view instanceof ViewGroup) {
            JSONArray children = new JSONArray();
            for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++)
                children.put(describe(((ViewGroup) view).getChildAt(index)));
            item.put("children", children);
        }
        return item;
    }

    private void capture(String name) throws Exception {
        SystemClock.sleep(350);
        File directory = getTargetContext().getExternalFilesDir(null);
        try (FileOutputStream out = new FileOutputStream(new File(directory, name + "-" + appearance + ".png"))) {
            Bitmap picture = getUiAutomation().takeScreenshot();
            if (picture == null || !picture.compress(Bitmap.CompressFormat.PNG, 100, out))
                throw new AssertionError("screenshot " + name);
        }
        String[] tree = {null};
        Throwable[] failure = {null};
        runOnMainSync(() -> {
            try { tree[0] = describe(activity.getWindow().getDecorView()).toString(2); }
            catch (Throwable error) { failure[0] = error; }
        });
        if (failure[0] != null) throw new AssertionError("tree capture", failure[0]);
        try (FileOutputStream out = new FileOutputStream(new File(directory, name + "-" + appearance + ".json"))) {
            out.write(tree[0].getBytes(StandardCharsets.UTF_8));
        }
        try (FileOutputStream out = new FileOutputStream(new File(directory, name + "-" + appearance + "-accessibility.json"))) {
            out.write(describeAccessibility(root()).toString(2).getBytes(StandardCharsets.UTF_8));
        }
    }

    private JSONObject describeAccessibility(AccessibilityNodeInfo node) throws Exception {
        JSONObject value = new JSONObject();
        if (node == null) return value;
        Rect rect = new Rect();
        node.getBoundsInScreen(rect);
        value.put("class", node.getClassName());
        value.put("id", node.getViewIdResourceName());
        value.put("text", node.getText());
        value.put("label", node.getContentDescription());
        value.put("visible", node.isVisibleToUser());
        value.put("bounds", rect.toShortString());
        JSONArray children = new JSONArray();
        for (int index = 0; index < node.getChildCount(); index++)
            children.put(describeAccessibility(node.getChild(index)));
        value.put("children", children);
        return value;
    }

    private void enterRankings() throws Exception {
        activate("home-rankings");
        check("shared TV rankings mounted", () -> has("ranking-drama:101") && has("ranking-actor:101"));
    }

    private void identity() throws Exception {
        check("TV shows two columns without changing namespace identity", () -> {
            Rect drama = bounds("ranking-drama:101");
            Rect actor = bounds("ranking-actor:101");
            return !drama.isEmpty() && !actor.isEmpty()
                && Math.abs(drama.top - actor.top) <= 2 && actor.left >= drama.right;
        });
        check("real drama rank retained", () -> label("ranking-drama:101").equals("第9名，榜单故事 101，查看详情"));
        check("real actor rank retained", () -> label("ranking-actor:101").equals("第13名，榜单演员 101，查看作品"));
        capture("rankings-two-columns");
        activate("ranking-actor:101");
        check("same-ID actor opens works rather than drama detail", () -> has("actor-works") && has("drama-501") && !has("episode-1011"));
        capture("actor-works");
        activate("drama-501");
        check("actor work opens its own drama detail", () -> has("episode-5011"));
        back();
        check("work detail returns to actor source", () -> focused("drama-501"));
        back();
        check("actor Back restores exact namespaced ranking source", () -> focused("ranking-actor:101"));
        confirm();
        check("restored actor source can reopen works", () -> has("actor-works"));
        back();
        check("actor remains exact return stop", () -> focused("ranking-actor:101"));
        activate("ranking-drama:101");
        check("same-ID drama opens drama detail", () -> has("episode-1011") && !has("actor-works"));
        back();
        check("drama Back restores exact namespaced source", () -> focused("ranking-drama:101"));
        confirm();
        check("restored drama source can reopen detail", () -> has("episode-1011"));
        back();
        check("drama source remains focused", () -> focused("ranking-drama:101"));
        walk("ranking-drama:102", KeyEvent.KEYCODE_DPAD_DOWN, 12);
        check("absent rank is not inferred from list index", () -> label("ranking-drama:102").equals("归乡之后仍然记得那年春山与故人的漫长故事 102，查看详情"));
        capture("rankings-missing-rank");
    }

    private void selectors() throws Exception {
        String sub = choice("sub:" + ancestors(WEEKLY), "sub & 2");
        check("server subranking label retained", () -> "服务端第二子榜".equals(label(sub)));
        activate(sub);
        check("subranking selection retained", () -> has("ranking-drama:101") && selected(sub));
        String deep = choice("sub:" + ancestors(WEEKLY, "sub & 2"), "deep/子榜 & 3");
        if (!has(deep)) walk(deep, KeyEvent.KEYCODE_DPAD_DOWN, 12);
        check("server nested label retained", () -> "更深子榜".equals(label(deep)));
        activate(deep);
        check("nested subranking selected", () -> has("ranking-drama:101") && selected(deep));
        String group = "panel:" + ancestors(WEEKLY) + ":period & raw:0";
        String period = choice(group, "panel/7 & raw");
        if (!has(period)) walk(period, KeyEvent.KEYCODE_DPAD_UP, 12);
        check("server panel label retained", () -> "近七天".equals(label(period)));
        activate(period);
        check("panel selection retained", () -> has("ranking-drama:101") && selected(period));
        capture("rankings-dynamic-selectors");
        String empty = choice(group, "");
        if (!has(empty)) walk(empty, KeyEvent.KEYCODE_DPAD_LEFT, 8);
        check("explicit empty panel keeps server label", () -> "默认时段".equals(label(empty)));
        activate(empty);
        check("explicit empty panel selected", () -> has("ranking-drama:101") && selected(empty));
        // Reach the root row through the actual filter viewport before horizontal selection.
        for (int index = 0; index < 24 && !has(choice("rank", WEEKLY)); index++) key(KeyEvent.KEYCODE_DPAD_UP);
        check("root ranking row remains reachable after nested filters", () -> has(choice("rank", WEEKLY)));
        selectRoot("", "服务端空值榜");
        check("explicit empty ranking renders its real empty state", () -> hasText("这个榜单暂时没有内容") && !has("ranking-more"));
        capture("rankings-empty-id");
        selectRoot(ACTOR, "服务端演员榜");
        check("actor ranking honors its opaque source ID", () -> has("ranking-actor:202") && !has("ranking-drama:101"));
        capture("rankings-actor-ranking");
    }

    private boolean selected(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node != null && node.isSelected();
    }

    private void loadTerminal() throws Exception {
        activate("ranking-more");
        check("HTTP 503 retains loaded rows and retry", () -> hasText("重试加载更多") && has("ranking-drama:101"));
        check("continuation error keeps retry focus", () -> focused("ranking-more"));
        capture("rankings-continuation-error");
        confirm();
        check("exact retry advances through empty continuation", () -> hasText("加载更多") && enabled("ranking-more") && has("ranking-drama:101"));
        check("empty advancement retains continuation focus", () -> focused("ranking-more"));
        capture("rankings-empty-advancement");
        confirm();
        check("delayed terminal disables duplicate submission", () -> hasText("正在加载…") && !enabled("ranking-more"));
    }

    private void pagination() throws Exception {
        loadTerminal();
        capture("rankings-terminal-pending");
        check("terminal removes continuation", () -> !has("ranking-more"));
        check("owned terminal returns to selected ranking control", () -> focused(choice("rank", WEEKLY)));
        capture("rankings-terminal-owned");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        check("owned handoff remains a live ranking selector", () -> focused(choice("rank", ACTOR)));
        confirm();
        check("remote confirm selects next ranking after terminal", () -> has("ranking-actor:202"));
    }

    private void newerSelector() throws Exception {
        loadTerminal();
        selectRoot(ACTOR, "服务端演员榜");
        check("new selector intention loads actor ranking", () -> has("ranking-actor:202"));
        SystemClock.sleep(2800);
        check("late terminal cannot overwrite new ranking or steal focus", () -> !has("ranking-drama:201")
            && has("ranking-actor:202") && focused(choice("rank", ACTOR)));
        capture("rankings-terminal-newer-selector");
        confirm();
        check("new selector source remains the input owner", () -> has("ranking-actor:202") && !has("actor-works"));
    }

    private void newerFocus() throws Exception {
        loadTerminal();
        focus("nav-discover");
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        check("new remote direction moves to history navigation", () -> focused("nav-history"));
        SystemClock.sleep(2800);
        check("same-list terminal cannot steal newer navigation focus", () -> !has("ranking-more") && focused("nav-history"));
        capture("rankings-terminal-newer-focus");
    }

    private void later() throws Exception {
        selectRoot(LATER, "长列表榜单");
        check("long ranking starts at first row", () -> has("ranking-drama:500") && !has("ranking-drama:540"));
        focus("ranking-drama:500");
        walk("ranking-drama:540", KeyEvent.KEYCODE_DPAD_DOWN, 90);
        check("later source leaves its focus ring fully inside viewport", () -> completeWithRing("ranking-drama:540"));
        Rect source = bounds("ranking-drama:540");
        capture("rankings-later-source");
        confirm();
        check("later drama opens its own detail", () -> has("episode-5401"));
        back();
        check("Back restores exact later source and visible focus ring", () -> focused("ranking-drama:540") && completeWithRing("ranking-drama:540"));
        check("later source viewport position retained", () -> Math.abs(bounds("ranking-drama:540").top - source.top) <= 2);
        capture("rankings-later-return");
        confirm();
        check("restored later source remains activatable", () -> has("episode-5401"));
        back();
        check("second Back retains later identity", () -> focused("ranking-drama:540"));
    }

    private void dense() throws Exception {
        selectRoot(DENSE, "密集动态榜单");
        check("dense ranking results remain available", () -> has("ranking-drama:901"));
        String[] path = new String[8];
        path[0] = DENSE;
        for (int index = 1; index < 8; index++) path[index] = "sub/" + index + " & raw";
        String deepest = choice("sub:" + ancestors(path), "sub/8 & raw");
        walk(deepest, KeyEvent.KEYCODE_DPAD_DOWN, 100);
        check("eighth server subranking label remains exact", () -> "第八层子榜".equals(label(deepest)));
        confirm();
        check("eighth subranking can be selected with remote", () -> has("ranking-drama:901") && selected(deepest));
        capture("rankings-dense-eighth-subranking");
        String lastPanel = choice("panel:" + ancestors(DENSE) + ":group/31:31", "choice/31 & raw");
        walk(lastPanel, KeyEvent.KEYCODE_DPAD_UP, 45);
        check("32nd server panel keeps exact label", () -> "筛选值 32".equals(label(lastPanel)));
        confirm();
        check("32nd panel is remote-selectable", () -> has("ranking-drama:901") && selected(lastPanel));
        capture("rankings-dense-last-panel");
        walk("ranking-drama:901", KeyEvent.KEYCODE_DPAD_DOWN, 60);
        check("dense filters leave complete result and focus ring available", () -> completeWithRing("ranking-drama:901"));
        confirm();
        check("dense result opens detail", () -> has("episode-9011"));
        back();
        check("dense detail restores exact result source", () -> focused("ranking-drama:901") && completeWithRing("ranking-drama:901"));
        capture("rankings-dense-return");
        walk("ranking-more", KeyEvent.KEYCODE_DPAD_DOWN, 12);
        confirm();
        check("dense continuation retry remains reachable", () -> hasText("重试加载更多") && focused("ranking-more"));
        capture("rankings-dense-recovery");
        confirm();
        check("dense retry advances without losing results", () -> hasText("加载更多") && enabled("ranking-more") && has("ranking-drama:901"));
    }

    private boolean completeRadar(String id) {
        Rect item = bounds(id);
        Rect viewport = bounds("radar-table");
        return !item.isEmpty() && !viewport.isEmpty()
            && item.left >= viewport.left + 4 && item.right <= viewport.right - 4
            && item.top >= viewport.top + 4 && item.bottom <= viewport.bottom - 4;
    }

    private void radar() throws Exception {
        activate("ranking-view-radar");
        check("radar uses independent snapshot source", () -> has("radar-entry-101"));
        check("subsequent radar rows are laid out and accessible", () -> has("radar-entry-102"));
        check("both source dates remain visible", () -> hasText("快照日期 2026-11-13 · 指标日期 2026-11-14 · 来源：hongguo-radar 外部聚合"));
        capture("radar-snapshot");
        activate("radar-columns-next");
        check("remote column control reveals the final metric", () -> has("radar-column-streak"));
        capture("radar-last-columns");
        activate("radar-columns-prev");
        check("remote column control restores title column", () -> has("radar-entry-101"));
        capture("radar-first-columns");
        focus("radar-entry-101");
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        check("table arrow moves to the next title", () -> focused("radar-entry-102"));
        confirm();
        check("mismatched detail cannot navigate", () -> has("radar-detail-retry") && !has("episode-1011"));
        capture("radar-wrong-identity");
        activate("radar-detail-retry");
        check("detail failure remains recoverable", () -> has("radar-detail-retry") && !has("episode-1021"));
        activate("radar-detail-retry");
        check("exact detail retry opens actual series", () -> has("episode-1021"));
        back();
        check("detail returns to exact table title", () -> focused("radar-entry-102") && completeRadar("radar-entry-102"));
        activate("radar-entry-101");
        check("first radar title opens actual detail", () -> has("episode-1011"));
        back();
        check("first radar title returns with visible ring", () -> focused("radar-entry-101") && completeRadar("radar-entry-101"));
        walk("radar-entry-540", KeyEvent.KEYCODE_DPAD_DOWN, 95);
        check("later virtual row remains fully visible", () -> completeRadar("radar-entry-540"));
        capture("radar-later-source");
        confirm();
        check("later exact ID opens its own detail", () -> has("episode-5401"));
        back();
        check("later table return preserves exact ID and full focus ring", () -> focused("radar-entry-540") && completeRadar("radar-entry-540"));
        capture("radar-later-return");
        confirm();
        check("restored later title remains activatable", () -> has("episode-5401"));
        back();
        check("second table return preserves identity", () -> focused("radar-entry-540"));
        activate("radar-view-growth");
        check("growth is a separate shared table", () -> has("radar-type-trigger") && has("radar-metric-trigger") && has("radar-entry-102"));
        capture("radar-growth");
        activate("radar-type-trigger");
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        confirm();
        check("native type selector applies real source kind", () -> text(find(root(), "radar-type-trigger"), "真人") && has("radar-entry-101") && !has("radar-entry-102"));
        activate("radar-type-trigger");
        back();
        check("native selector Back restores its trigger", () -> focused("radar-type-trigger"));
        activate("radar-metric-trigger");
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        confirm();
        check("native growth metric selector changes the shared sort", () -> text(find(root(), "radar-metric-trigger"), "收藏增量"));
        capture("radar-filtered-growth");
        activate("radar-view-snapshot");
        check("snapshot selection survives growth browsing", () -> has("radar-entry-101"));
        activate("radar-refresh");
        check("partial refresh keeps ranks and identifies stale joined growth", () -> has("radar-entry-101") && has("radar-growth-status"));
        capture("radar-partial");
        activate("radar-refresh");
        check("independent cached branch and failed save are visible", () -> has("radar-stale") && has("radar-cache-warning") && has("radar-entry-101"));
        capture("radar-cached");
        activate("radar-refresh");
        check("refresh failure keeps readable prior content", () -> has("radar-retry") && has("radar-entry-101"));
        capture("radar-refresh-error");
        activate("radar-retry");
        check("refresh retry recovers without invented write", () -> !has("radar-retry") && !has("radar-stale") && has("radar-entry-101"));
        activate("ranking-view-official");
        check("official actor and drama ranking remain intact", () -> has("ranking-drama:101") && has("ranking-actor:101"));
        capture("radar-official-return");
    }

    private AccessibilityNodeInfo labeledControl(AccessibilityNodeInfo node, String value) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (node.isFocusable() && node.isClickable() && text(node, value)) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = labeledControl(node.getChild(index), value);
            if (found != null) return found;
        }
        return null;
    }

    private boolean completeInside(String id, String container) {
        Rect item = bounds(id), viewport = bounds(container);
        return !item.isEmpty() && !viewport.isEmpty()
            && item.left >= viewport.left + 4 && item.right <= viewport.right - 4
            && item.top >= viewport.top + 4 && item.bottom <= viewport.bottom - 4;
    }

    private View shownNativeView(View view, String id) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return null;
        if (id.equals(view.createAccessibilityNodeInfo().getViewIdResourceName())) return view;
        if (view instanceof ViewGroup)
            for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) {
                View found = shownNativeView(((ViewGroup) view).getChildAt(index), id);
                if (found != null) return found;
            }
        return null;
    }

    private boolean noExtraSections() {
        final boolean[] empty = { false };
        runOnMainSync(() -> empty[0] = shownNativeView(activity.getWindow().getDecorView(), "detail-actors") == null
            && shownNativeView(activity.getWindow().getDecorView(), "detail-related") == null);
        return empty[0];
    }

    private boolean staticActorName(int index) {
        final boolean[] readOnly = { false };
        runOnMainSync(() -> {
            View view = shownNativeView(activity.getWindow().getDecorView(), "detail-actor-name-" + index);
            if (view == null) return;
            AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
            readOnly[0] = node != null && !node.isClickable() && !node.isFocusable();
        });
        return readOnly[0];
    }

    private boolean readableActorName(int index, String name) {
        String region = "focus-region-detail-actor-name-" + index;
        AccessibilityNodeInfo node = find(root(), region);
        Rect frame = bounds(region), text = bounds("detail-actor-name-" + index);
        return node != null && node.isFocusable() && !node.isClickable()
            && name.equals(String.valueOf(node.getContentDescription())) && staticActorName(index)
            && completeInside(region, "detail-scroll")
            && completeInside("detail-actor-name-" + index, "detail-scroll")
            && text.left >= frame.left + 6 && text.right <= frame.right - 6
            && text.top >= frame.top + 6 && text.bottom <= frame.bottom - 6;
    }

    private void detailExtras() throws Exception {
        check("history offers read-only detail entry", () -> labeledControl(root(), "选集与详情") != null);
        AccessibilityNodeInfo entry = labeledControl(root(), "选集与详情");
        if (!entry.performAction(AccessibilityNodeInfo.ACTION_FOCUS)) throw new AssertionError("focus history detail entry");
        confirm();
        check("original detail is read from HTTP", () -> has("episode-1231") && has("season-124"));
        capture("detail-original");
        focus("detail-start");
        walk("detail-actor-9007199254740993", KeyEvent.KEYCODE_DPAD_DOWN, 16);
        check("long actor name retains exact identity", () -> label("detail-actor-9007199254740993").equals("林初与山海之间的漫长旅程还有那些未曾说完的故事在岁月流转之后再次走向春天的约定"));
        check("actor without identity retains static text", () -> staticActorName(1));
        capture("detail-actors");
        walkByGeometry("focus-region-detail-actor-name-1", 12);
        check("remote can read the complete actor name without a destination", () -> readableActorName(1, READ_ONLY_ACTOR));
        capture("detail-read-only-actor");
        confirm();
        check("confirm on actor reading stop cannot navigate", () -> focused("focus-region-detail-actor-name-1")
            && has("episode-1231") && !has("actor-results"));
        walkByGeometry("drama-300", 12);
        check("reading stop continues down to related works", () -> completeInside("drama-300", "detail-scroll"));
        walkByGeometry("focus-region-detail-actor-name-1", 12);
        check("upward return keeps actor name fully readable", () -> readableActorName(1, READ_ONLY_ACTOR));
        walkByGeometry("detail-actor-9007199254740993", 12);
        check("reading stop returns to the exact actor destination", () -> focused("detail-actor-9007199254740993"));
        confirm();
        check("actor opens its own works", () -> has("actor-results") && has("drama-123"));
        focus("drama-123");
        walk("drama-204", KeyEvent.KEYCODE_DPAD_RIGHT, 90);
        check("later actor work has complete focus ring", () -> completeInside("drama-204", "actor-results"));
        capture("detail-later-actor-work");
        confirm();
        check("later actor work opens correct detail without inherited extras", () -> has("episode-2041") && noExtraSections());
        back();
        check("later actor work returns to exact visible card", () -> focused("drama-204") && completeInside("drama-204", "actor-results"));
        capture("detail-actor-work-return");
        confirm();
        check("restored actor work remains activatable", () -> has("episode-2041"));
        back();
        check("second actor work return keeps identity", () -> focused("drama-204"));
        back();
        check("actor returns to originating detail button", () -> focused("detail-actor-9007199254740993") && completeInside("detail-actor-9007199254740993", "detail-scroll"));
        capture("detail-actor-source-return");
        confirm();
        check("restored actor button remains activatable", () -> has("actor-results"));
        back();
        check("actor button restores on repeated return", () -> focused("detail-actor-9007199254740993"));
        walk("drama-300", KeyEvent.KEYCODE_DPAD_DOWN, 8);
        confirm();
        check("related work with only an unnamed-ID actor opens its own detail", () -> has("episode-3001") && has("detail-actors")
            && !has("detail-actor-9007199254740993") && !has("detail-related"));
        walkByGeometry("focus-region-detail-actor-name-0", 24);
        check("name-only detail exposes all one hundred characters inside the detail viewport", () -> ONLY_ACTOR_NAME.length() == 100
            && readableActorName(0, ONLY_ACTOR_NAME));
        capture("detail-only-read-only-actor");
        confirm();
        check("name-only actor confirm remains in the same detail", () -> focused("focus-region-detail-actor-name-0")
            && has("episode-3001") && !has("actor-results"));
        back();
        check("name-only detail returns to exact related source", () -> focused("drama-300") && completeInside("drama-300", "detail-scroll"));
        capture("detail-only-read-only-return");
        walk("drama-340", KeyEvent.KEYCODE_DPAD_DOWN, 14);
        walk("drama-343", KeyEvent.KEYCODE_DPAD_RIGHT, 4);
        for (int index = 340; index <= 343; index++) {
            final String id = "drama-" + index;
            check("last related row retains complete card " + id, () -> completeInside(id, "detail-scroll"));
        }
        check("later related card has complete focus ring", () -> completeInside("drama-343", "detail-scroll"));
        capture("detail-later-related");
        confirm();
        check("related card opens correct detail without inherited extras", () -> has("episode-3431") && noExtraSections());
        back();
        check("related return restores exact later card and ring", () -> focused("drama-343") && completeInside("drama-343", "detail-scroll"));
        capture("detail-related-source-return");
        confirm();
        check("restored related card remains activatable", () -> has("episode-3431"));
        back();
        check("second related return keeps identity", () -> focused("drama-343"));
        // The rightmost lane now includes the read-only name; return through the season's left lane.
        walk("drama-340", KeyEvent.KEYCODE_DPAD_LEFT, 4);
        for (int index = 0; index < 26 && !focused("season-123") && !focused("season-124"); index++) key(KeyEvent.KEYCODE_DPAD_UP);
        check("remote returns to the season selector", () -> focused("season-123") || focused("season-124"));
        if (!focused("season-124")) walk("season-124", KeyEvent.KEYCODE_DPAD_RIGHT, 3);
        confirm();
        check("another season hides both empty sections", () -> has("episode-1241") && noExtraSections());
        capture("detail-empty-extras-season");
        walk("season-123", KeyEvent.KEYCODE_DPAD_LEFT, 3);
        confirm();
        check("original season restores its own episode", () -> has("episode-1231") && !has("episode-1241"));
        walk("detail-actor-9007199254740993", KeyEvent.KEYCODE_DPAD_DOWN, 16);
        check("original season restores its own actor section", () -> has("detail-actors"));
        capture("detail-original-extras-restored");
        walk("drama-300", KeyEvent.KEYCODE_DPAD_DOWN, 8);
        check("original season restores its own related section", () -> has("detail-related") && completeInside("drama-300", "detail-scroll"));
        capture("detail-original-related-restored");
    }

    @Override public void onStart() {
        if ("player".equals(arguments.getString("suite"))) {
            new PlayerAcceptance(this, appearance).run();
            return;
        }
        Bundle result = new Bundle();
        try {
            Intent launch = getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("independent Leanback launcher missing");
            activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("shared TV application mounted", () -> has("home-rankings"));
            String suite = arguments.getString("suite", "identity");
            if ("detail-extras".equals(suite)) detailExtras();
            else {
                enterRankings();
                switch (suite) {
                    case "identity": identity(); break;
                    case "selectors": selectors(); break;
                    case "pagination": pagination(); break;
                    case "newer-selector": newerSelector(); break;
                    case "newer-focus": newerFocus(); break;
                    case "later": later(); break;
                    case "dense": dense(); break;
                    case "radar": radar(); break;
                    default: throw new AssertionError("Unknown suite");
                }
            }
            result.putString("stream", "Rankings real TV adapter: " + checks + " checks passed\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { if (activity != null) capture("failure"); }
            catch (Throwable captureError) { error.addSuppressed(captureError); }
            result.putString("stream", "FAIL " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
