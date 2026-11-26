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
import android.widget.EditText;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Production shared App and TvRemote; synthetic series/media and process-only guest history. */
@android.annotation.TargetApi(34)
public final class SeasonsAcceptance extends Instrumentation {
    private Bundle arguments;
    private Activity activity;
    private int checks;
    private String appearance;
    private static final String FIRST = "春山不负 · 第1季 · 第 1 集";
    private static final String SECOND = "春山不负 · 第2季 · 第 1 集";
    private static final String[] SEASONS = {"101", "201", "301", "401"};

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        this.arguments = arguments;
        appearance = arguments.getString("appearance", "light-details");
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
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String value) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (value.equals(node.getViewIdResourceName()) || value.equals(String.valueOf(node.getText()))
                || value.equals(String.valueOf(node.getContentDescription()))) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = find(node.getChild(index), value);
            if (found != null) return found;
        }
        return null;
    }
    private boolean has(String value) { return find(root(), value) != null; }
    private String label(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node == null ? "" : String.valueOf(node.getContentDescription());
    }
    private boolean focused(String value) {
        AccessibilityNodeInfo node = find(root(), value);
        while (node != null) { if (node.isFocused()) return true; node = node.getParent(); }
        return false;
    }
    private String focusedIdentity() {
        AccessibilityNodeInfo node = root();
        node = node == null ? null : node.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        return node == null ? "none" : String.valueOf(node.getViewIdResourceName());
    }
    private boolean enabled(String value) {
        AccessibilityNodeInfo node = find(root(), value);
        return node != null && node.isEnabled();
    }
    private boolean selected(String value) {
        AccessibilityNodeInfo node = find(root(), value);
        return node != null && (node.isSelected() || node.isChecked());
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
    private boolean disabled(String id) {
        boolean[] result = {false};
        runOnMainSync(() -> {
            View view = nativeView(activity.getWindow().getDecorView(), id);
            result[0] = view != null && !view.createAccessibilityNodeInfo().isEnabled();
        });
        return result[0];
    }
    private void key(int code) { sendKeyDownUpSync(code); SystemClock.sleep(250); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void back() { key(KeyEvent.KEYCODE_BACK); }

    // Accessibility establishes a named start; actual movement and confirmation are real keys.
    private void focus(String value) {
        AccessibilityNodeInfo node = find(root(), value);
        while (node != null && !node.isFocusable()) node = node.getParent();
        if (node == null || (!node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)))
            throw new AssertionError("focus " + value);
        check("native focus " + value, () -> focused(value));
    }
    private void activate(String value) { focus(value); confirm(); }
    private void walk(String id, int direction, int maximum) {
        for (int index = 0; index < maximum && !focused(id); index++) key(direction);
        check("remote reaches " + id, () -> focused(id));
    }
    private boolean scrollForward(AccessibilityNodeInfo node) {
        if (node == null) return false;
        if (node.isScrollable() && node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true;
        for (int index = 0; index < node.getChildCount(); index++)
            if (scrollForward(node.getChild(index))) return true;
        return false;
    }
    private void reveal(String value) {
        for (int page = 0; page < 10 && !has(value); page++) {
            if (!scrollForward(find(root(), "detail-scroll"))) break;
            SystemClock.sleep(150);
        }
    }
    private void choose(String id) {
        String target = "season-" + id;
        if (!has(target)) {
            int visible = -1, destination = -1;
            for (int index = 0; index < SEASONS.length; index++) {
                if (SEASONS[index].equals(id)) destination = index;
                if (has("season-" + SEASONS[index])) visible = index;
            }
            if (visible < 0 || destination < 0) throw new AssertionError("season row unavailable " + id);
            focus("season-" + SEASONS[visible]);
            walk(target, destination > visible ? KeyEvent.KEYCODE_DPAD_RIGHT : KeyEvent.KEYCODE_DPAD_LEFT, 8);
        } else focus(target);
        confirm();
        check("selection follows confirmed season " + id, () -> selected(target));
    }
    private String clock(AccessibilityNodeInfo node) {
        if (node == null) return "";
        if (node.getText() != null && node.getText().toString().matches("\\d{2}:\\d{2} / \\d{2}:\\d{2}")) return node.getText().toString();
        for (int index = 0; index < node.getChildCount(); index++) {
            String value = clock(node.getChild(index));
            if (!value.isEmpty()) return value;
        }
        return "";
    }
    private int position() {
        String value = clock(root());
        return value.isEmpty() ? -1 : Integer.parseInt(value.substring(0, 2)) * 60 + Integer.parseInt(value.substring(3, 5));
    }
    private String history() {
        HttpURLConnection connection = null;
        try {
            String origin = arguments.getString("fixtureOrigin", "");
            if (!origin.matches("http://127\\.0\\.0\\.1:[0-9]+")) throw new AssertionError("local fixture origin required");
            connection = (HttpURLConnection) URI.create(origin + "/api/v1/library").toURL().openConnection();
            connection.setConnectTimeout(3000);
            connection.setReadTimeout(3000);
            if (connection.getResponseCode() != 200) throw new AssertionError("history snapshot response");
            try (java.io.InputStream input = connection.getInputStream()) {
                JSONObject envelope = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
                if (!envelope.getBoolean("ok")) throw new AssertionError("history snapshot envelope");
                return envelope.getJSONObject("data").toString();
            }
        } catch (Exception error) {
            throw new AssertionError("read-only fixture history snapshot", error);
        } finally {
            if (connection != null) connection.disconnect();
        }
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

    private void enterDetail() throws Exception {
        activate("nav-search");
        check("TV search input is available", () -> has("search-input") || has("search-input-activate"));
        if (!(activity.getCurrentFocus() instanceof EditText)) activate("search-input-activate");
        check("confirm enters native editing", () -> activity.getCurrentFocus() instanceof EditText);
        sendStringSync("story");
        key(KeyEvent.KEYCODE_ENTER);
        check("synthetic public search result", () -> has("drama-101"));
        activate("drama-101");
        check("original detail loads before any playback", () -> has("detail-start") && enabled("detail-start"));
        focus("season-101");
        check("original season is selected", () -> selected("season-101"));
        key(KeyEvent.KEYCODE_DPAD_RIGHT);
        check("DPAD focus does not commit another season", () -> focused("season-201") && selected("season-101") && !selected("season-201"));
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        check("DPAD returns to original season", () -> focused("season-101"));
        capture("original-detail");
    }
    private void detailChecks(boolean mismatch) throws Exception {
        String emptyHistory = history();
        if (!mismatch) {
            choose("301");
            reveal("该季尚未上线，没有可播放的选集。");
            check("upcoming has no episode targets", () -> has("该季尚未上线，没有可播放的选集。") && !has("episode-1001") && !has("episode-2001"));
            check("upcoming main watch action is disabled", () -> disabled("detail-start"));
            capture("upcoming");
            choose("401");
            reveal("这一季暂时无法观看。");
            check("unavailable remains browseable without episode targets", () -> has("这一季暂时无法观看。") && !has("episode-1001") && !has("episode-2001"));
            check("unavailable main watch action is disabled", () -> disabled("detail-start"));
            capture("unavailable");
        }
        choose("201");
        reveal("detail-episodes-error");
        check(mismatch ? "mismatched detail identity is rejected" : "HTTP503 keeps safe retry", () -> has("detail-episodes-error") && !has("episode-1001") && !has("episode-2001"));
        check("failed detail cannot start stale media", () -> disabled("detail-start"));
        capture(mismatch ? "identity-rejected" : "detail-error");
        activate("重试");
        check("retry restores enabled watch action", () -> enabled("detail-start") && !has("detail-episodes-error"));
        focus("season-101");
        walk("episode-2001", KeyEvent.KEYCODE_DPAD_DOWN, 6);
        check("same selection recovers real episode members", () -> has("episode-2001") && !has("episode-1001"));
        check("recovered episode belongs to second season", () -> selected("season-201"));
        check("browsing and retry leave guest history unchanged", () -> emptyHistory.equals(history()));
        capture("second-season-ready");
        back();
        check("detail Back restores exact search card", () -> focused("drama-101") && !has("detail-start"));
        confirm();
        check("restored source can reopen original detail", () -> has("detail-start") && enabled("detail-start"));
        back();
        check("source remains reachable after repeated return", () -> focused("drama-101"));
    }
    private void pause(String title) {
        check("real decoder starts confirmed episode", () -> has(title) && position() >= 1);
        key(KeyEvent.KEYCODE_MEDIA_PAUSE);
        check("real media pause reveals controls", () -> has("播放") && !has("暂停"));
        int paused = position();
        SystemClock.sleep(1200);
        check("paused media clock is stable", () -> position() == paused);
    }
    private void playerChecks() throws Exception {
        choose("101");
        focus("season-101");
        walk("episode-1001", KeyEvent.KEYCODE_DPAD_DOWN, 16);
        confirm();
        pause(FIRST);
        check("actual first playback creates compact history", () -> history().contains("1001"));
        int paused = position();
        activate("player-episode-panel");
        check("player episode panel opens", () -> has("关闭选集") && has("season-101"));
        check("real playing season status", () -> "第1季，播放中".equals(label("season-101")));
        String beforeBrowse = history();
        choose("201");
        check("browsed second season exposes its real episodes", () -> has("player-episode-2001") && selected("season-201"));
        check("selection does not change real playing identity", () -> "第1季，播放中".equals(label("season-101")) && "第2季，可观看".equals(label("season-201")));
        capture("player-browsing-second");
        choose("301");
        check("player upcoming has no playable choices", () -> has("本季待上线") && !has("player-episode-2001") && !has("player-episode-1001"));
        choose("401");
        check("player unavailable has no playable choices", () -> has("本季暂不可观看") && !has("player-episode-2001") && !has("player-episode-1001"));
        check("season browsing cannot rewrite playback history", () -> beforeBrowse.equals(history()));
        capture("player-unavailable");
        back();
        check("panel Back restores exact native trigger", () -> focused("player-episode-panel") && !has("关闭选集"));
        check("browsing keeps actual media and paused position", () -> has(FIRST) && position() == paused);
        confirm();
        check("restored trigger can reopen episode panel", () -> has("关闭选集"));
        choose("201");
        check("cached second season remains available", () -> has("player-episode-2001"));
        focus("season-201");
        walk("player-episode-2001", KeyEvent.KEYCODE_DPAD_DOWN, 16);
        confirm();
        pause(SECOND);
        activate("player-episode-panel");
        check("confirmed episode changes real playing season", () -> "第2季，播放中".equals(label("season-201")));
        check("previous actual season becomes resumable", () -> "第1季，可续播".equals(label("season-101")));
        capture("second-playing-and-resume");
        back();
        check("new player panel restores trigger", () -> focused("player-episode-panel"));
        back();
        check("Back hides controls before leaving", () -> has("显示播放控制") && !has("关闭选集"));
        back();
        check("player return keeps original detail browse source", () -> has("episode-1001") && !has("episode-2001"));
        check("player Back restores exact original episode", () -> focused("episode-1001"));
        capture("original-detail-return");
        back();
        check("detail return restores original search result", () -> focused("drama-101"));
    }
    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent launch = getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("independent Leanback launcher missing");
            activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("shared TV application mounted", () -> has("nav-search"));
            enterDetail();
            String suite = arguments.getString("suite", "details");
            if (suite.equals("player-browse")) playerChecks();
            else if (suite.equals("details") || suite.equals("mismatch")) detailChecks(suite.equals("mismatch"));
            else throw new AssertionError("unknown series suite " + suite);
            result.putString("stream", "Seasons real TV adapter: " + checks + " checks passed\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { if (activity != null) capture("failure"); }
            catch (Throwable captureError) { error.addSuppressed(captureError); }
            result.putString("stream", "FAIL " + error + " after " + checks + " checks\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
