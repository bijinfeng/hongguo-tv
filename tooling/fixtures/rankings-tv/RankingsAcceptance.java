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
            enterRankings();
            switch (arguments.getString("suite", "identity")) {
                case "identity": identity(); break;
                case "selectors": selectors(); break;
                case "pagination": pagination(); break;
                case "newer-selector": newerSelector(); break;
                case "newer-focus": newerFocus(); break;
                case "later": later(); break;
                case "dense": dense(); break;
                default: throw new AssertionError("Unknown suite");
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
