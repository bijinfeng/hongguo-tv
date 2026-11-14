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
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Isolated TV input-adapter acceptance; production Java sources, shared TSX, local GET fixture. */
@android.annotation.TargetApi(34)
public final class CalendarAcceptance extends Instrumentation {
    private Bundle arguments;
    private Activity activity;
    private int checks;
    private String appearance;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        this.arguments = arguments;
        appearance = arguments.getString("appearance", "light");
        start();
    }

    private void check(String name, BooleanSupplier condition) {
        long until = SystemClock.uptimeMillis() + 15000;
        while (!condition.getAsBoolean()) {
            if (SystemClock.uptimeMillis() > until) throw new AssertionError(name);
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
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = find(node.getChild(i), id);
            if (found != null) return found;
        }
        return null;
    }

    private boolean has(String id) { return find(root(), id) != null; }
    private boolean focused(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        return node != null && node.isFocused();
    }

    private void key(int code) { sendKeyDownUpSync(code); SystemClock.sleep(250); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }

    private void focus(String id) {
        AccessibilityNodeInfo node = find(root(), id);
        if (node == null || (!node.isFocused() && !node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)))
            throw new AssertionError("focus " + id);
        check("native keyboard focus " + id, () -> focused(id));
    }

    private void activate(String id) { focus(id); confirm(); }

    private JSONObject describe(View view) throws Exception {
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        JSONObject item = new JSONObject();
        Rect bounds = new Rect();
        view.getGlobalVisibleRect(bounds);
        item.put("class", view.getClass().getName());
        item.put("id", node.getViewIdResourceName());
        item.put("text", node.getText());
        item.put("label", node.getContentDescription());
        item.put("focused", view.isFocused());
        item.put("visible", view.isShown());
        item.put("bounds", bounds.toShortString());
        item.put("width", view.getWidth());
        item.put("height", view.getHeight());
        item.put("scrollX", view.getScrollX());
        item.put("scrollY", view.getScrollY());
        if (view instanceof ViewGroup) {
            JSONArray children = new JSONArray();
            for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++)
                children.put(describe(((ViewGroup) view).getChildAt(i)));
            item.put("children", children);
        }
        return item;
    }

    private int maximumScroll(View view) {
        int result = view.getScrollY();
        if (view instanceof ViewGroup)
            for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++)
                result = Math.max(result, maximumScroll(((ViewGroup) view).getChildAt(i)));
        return result;
    }

    private int scrollY() {
        int[] value = {0};
        runOnMainSync(() -> {
            View region = nativeView(activity.getWindow().getDecorView(), "focus-region-calendar-announcement-content");
            value[0] = region == null ? 0 : maximumScroll(region);
        });
        return value[0];
    }

    private View nativeView(View view, String id) {
        if (id.equals(view.createAccessibilityNodeInfo().getViewIdResourceName())) return view;
        if (view instanceof ViewGroup)
            for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
                View found = nativeView(((ViewGroup) view).getChildAt(i), id);
                if (found != null) return found;
            }
        return null;
    }

    private void capture(String name) throws Exception {
        SystemClock.sleep(500);
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

    private void calendar() throws Exception {
        activate("home-calendar");
        check("calendar date and announcement from GET fixture", () -> has("calendar-date-20261114") && has("calendar-upcoming-301"));
        capture("calendar");
        activate("calendar-upcoming-301");
        check("announcement opens with reachable close", () -> has("calendar-announcement-close"));
        check("announcement owns native close focus", () -> focused("calendar-announcement-close"));
        capture("announcement");
        confirm();
        check("close restores exact upcoming source", () -> focused("calendar-upcoming-301") && !has("calendar-announcement-close"));
        capture("announcement-return");
        confirm();
        check("source DPAD confirm reopens announcement", () -> has("calendar-announcement-close"));
        key(KeyEvent.KEYCODE_BACK);
        check("remote Back closes announcement to source", () -> focused("calendar-upcoming-301") && !has("calendar-announcement-close"));
        activate("calendar-released-101");
        check("released card opens shared detail", () -> has("episode-1011"));
        key(KeyEvent.KEYCODE_BACK);
        check("released detail returns exact calendar source", () -> focused("calendar-released-101"));
        activate("calendar-date-20261115");
        check("remote selects independent next date", () -> has("calendar-upcoming-311"));
        capture("calendar-next-date");
        focus("calendar-date-20261115");
        key(KeyEvent.KEYCODE_DPAD_LEFT);
        check("left roves date without selecting content", () -> focused("calendar-date-20261114") && has("calendar-upcoming-311"));
        confirm();
        check("confirm restores cached initial date", () -> has("calendar-upcoming-301"));
        activate("calendar-mode-new");
        check("new mode loads its independent list", () -> has("calendar-released-201"));
        capture("new-series");
    }

    private void longAnnouncement() throws Exception {
        activate("home-calendar");
        check("long calendar available", () -> has("calendar-upcoming-301"));
        activate("calendar-upcoming-301");
        check("long announcement close reachable", () -> has("calendar-announcement-close"));
        capture("announcement-long-top");
        int before = scrollY();
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        check("remote enters named reading region", () -> focused("focus-region-calendar-announcement-content"));
        confirm();
        check("reading region confirm has no action", () -> has("calendar-announcement-close") && focused("focus-region-calendar-announcement-content") && scrollY() == before);
        for (int i = 0; i < 11; i++) key(KeyEvent.KEYCODE_DPAD_DOWN);
        check("remote DPAD scrolls long announcement", () -> scrollY() > before);
        capture("announcement-long-scrolled");
        for (int i = 0; i < 20 && scrollY() > before; i++) key(KeyEvent.KEYCODE_DPAD_UP);
        check("remote scrolls reading region back to top", () -> scrollY() == before);
        key(KeyEvent.KEYCODE_DPAD_UP);
        check("remote leaves top edge for close", () -> focused("calendar-announcement-close"));
        key(KeyEvent.KEYCODE_DPAD_DOWN);
        check("reading region remains reachable", () -> focused("focus-region-calendar-announcement-content"));
        key(KeyEvent.KEYCODE_BACK);
        check("long announcement Back restores exact source", () -> focused("calendar-upcoming-301") && !has("calendar-announcement-close"));
        confirm();
        check("long source confirm reopens announcement", () -> has("calendar-announcement-close"));
        activate("calendar-announcement-close");
        check("long close restores exact source", () -> focused("calendar-upcoming-301"));
    }

    @SuppressWarnings("deprecation")
    private void compatibilityContract() {
        AccessibilityNodeInfo node = AccessibilityNodeInfo.obtain();
        node.setContentDescription("播放设置");
        node.setEnabled(true);
        node.setScrollable(true);
        node.setViewIdResourceName("media-settings");
        node.getExtras().putCharSequence("AccessibilityNodeInfo.roleDescription", "region");
        check("legacy named media panel does not become a reading stop", () -> !TvRemote.readingRegionOptIn(29, node));
        node.setViewIdResourceName("focus-region-test-reading");
        node.getExtras().remove("AccessibilityNodeInfo.roleDescription");
        check("legacy explicit marker retains reading opt in without role metadata", () -> TvRemote.readingRegionOptIn(26, node) && TvRemote.readingRegionOptIn(29, node));
        node.getExtras().putCharSequence("AccessibilityNodeInfo.roleDescription", "dialog");
        check("modern marker cannot turn a dialog into a reading region", () -> !TvRemote.readingRegionOptIn(30, node) && !TvRemote.readingRegionOptIn(34, node));
        node.setViewIdResourceName("ordinary-region");
        node.getExtras().putCharSequence("AccessibilityNodeInfo.roleDescription", "region");
        check("modern explicit region role remains authoritative", () -> TvRemote.readingRegionOptIn(30, node) && TvRemote.readingRegionOptIn(34, node));
        node.recycle();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if (appearance.equals("light-standard")) compatibilityContract();
            Intent launch = getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("independent Leanback launcher missing");
            activity = startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            check("shared TV application mounted", () -> has("home-calendar"));
            if (Boolean.parseBoolean(arguments.getString("long", "false"))) longAnnouncement(); else calendar();
            result.putString("stream", "Calendar real TV adapter: " + checks + " checks passed\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            try { if (activity != null) capture("failure"); }
            catch (Throwable captureError) { error.addSuppressed(captureError); }
            result.putString("stream", "FAIL " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
