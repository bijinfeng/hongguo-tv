package dev.hongguo.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.InvocationTargetException;
import org.json.JSONObject;

/** Installed production entry and Android boundary checks; no synthetic update source is shipped. */
@android.annotation.TargetApi(34)
final class UpdateAcceptance {
    private final Instrumentation runner;
    private int checks;
    private Bundle args;
    UpdateAcceptance(Instrumentation runner, Bundle args) { this.runner = runner; this.args = args; }
    private void verify(String name, boolean condition) {
        if (!condition) throw new AssertionError(name);
        checks++;
        Bundle status = new Bundle(); status.putString("stream", "PASS " + name + "\n"); runner.sendStatus(0, status);
    }
    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label) {
        if (node == null || !node.isVisibleToUser()) return null;
        if (label.contentEquals(node.getText() == null ? "" : node.getText())
                || label.contentEquals(node.getContentDescription() == null ? "" : node.getContentDescription())) return node;
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo found = find(node.getChild(i), label); if (found != null) return found;
        }
        return null;
    }
    private AccessibilityNodeInfo waitFor(String label) {
        long until = SystemClock.uptimeMillis() + 30000;
        while (SystemClock.uptimeMillis() < until) {
            runner.getUiAutomation().clearCache();
            AccessibilityNodeInfo found = find(runner.getUiAutomation().getRootInActiveWindow(), label);
            if (found != null) return found;
            SystemClock.sleep(100);
        }
        throw new AssertionError("missing " + label);
    }
    private void press(String label) {
        AccessibilityNodeInfo node = waitFor(label);
        while (node != null && !node.isClickable()) node = node.getParent();
        // The host focus engine may refuse external focus requests on a freshly mounted page;
        // retry, then fall back to a system pointer tap on the same control.
        boolean focusedNode = false;
        for (int attempt = 0; attempt < 5 && node != null; attempt++) {
            if (node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)) { focusedNode = true; break; }
            SystemClock.sleep(400);
            node = waitFor(label);
            while (node != null && !node.isClickable()) node = node.getParent();
        }
        if (node == null) throw new AssertionError("missing clickable " + label);
        if (focusedNode) {
            runner.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_CENTER);
        } else {
            android.graphics.Rect bounds = new android.graphics.Rect();
            node.getBoundsInScreen(bounds);
            long now = SystemClock.uptimeMillis();
            runner.sendPointerSync(android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_DOWN, bounds.centerX(), bounds.centerY(), 0));
            runner.sendPointerSync(android.view.MotionEvent.obtain(now, now, android.view.MotionEvent.ACTION_UP, bounds.centerX(), bounds.centerY(), 0));
            SystemClock.sleep(400);
        }
    }
    private boolean focused(String label) {
        AccessibilityNodeInfo node = waitFor(label);
        while (node != null) {
            if (node.isFocused()) return true;
            node = node.getParent();
        }
        return false;
    }
    private boolean has(String label) {
        try { waitFor(label); return true; } catch (AssertionError failure) { return false; }
    }
    private String describe(AccessibilityNodeInfo node) {
        if (node == null || !node.isVisibleToUser()) return "";
        StringBuilder result = new StringBuilder();
        result.append(node.getViewIdResourceName()).append(" ").append(node.getContentDescription())
                .append(" ").append(node.getText()).append(" focused=").append(node.isFocused())
                .append(" enabled=").append(node.isEnabled()).append("\n");
        for (int i = 0; i < node.getChildCount(); i++) result.append(describe(node.getChild(i)));
        return result.toString();
    }
    void run() {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            Activity activity = runner.startActivitySync(launch);
            String version = UpdateInstaller.packageInfo(activity).versionName;
            verify("Android reports actual installed build", ((Number) UpdateInstaller.info(activity).get("build")).longValue()
                    == UpdateInstaller.version(UpdateInstaller.packageInfo(activity)));
            java.lang.reflect.Field field = MainActivity.class.getDeclaredField("updates"); field.setAccessible(true);
            Object installer = field.get(activity);
            java.lang.reflect.Method install = UpdateInstaller.class.getDeclaredMethod("install", JSONObject.class);
            install.setAccessible(true);
            int sessions = activity.getPackageManager().getPackageInstaller().getMySessions().size();
            boolean refused = false;
            try { install.invoke(installer, new JSONObject().put("path", "/data/local/tmp/untrusted.apk")); }
            catch (InvocationTargetException error) { refused = error.getCause().getMessage().contains("更新包不可用"); }
            verify("Installer rejects paths outside private staged APK", refused);
            verify("Rejected update creates no installation session", sessions == activity.getPackageManager().getPackageInstaller().getMySessions().size());
            android.content.SharedPreferences prefs = UpdateInstaller.prefs(activity);
            java.util.Map<String, ?> saved = prefs.getAll();
            try {
                long actual = UpdateInstaller.version(UpdateInstaller.packageInfo(activity));
                prefs.edit().putLong("expected", actual + 1).putString("state", "installing").putInt("session", -1).commit();
                verify("A simulated receipt cannot confirm an uninstalled version", !"success".equals(UpdateInstaller.info(activity).get("state")));
                prefs.edit().putLong("expected", actual).putString("state", "installing").commit();
                verify("Actual version match consumes a simulated receipt once", "success".equals(UpdateInstaller.info(activity).get("state"))
                        && "idle".equals(UpdateInstaller.info(activity).get("state")));
            } finally {
                android.content.SharedPreferences.Editor restore = prefs.edit().clear();
                for (java.util.Map.Entry<String, ?> entry : saved.entrySet()) {
                    Object value = entry.getValue();
                    if (value instanceof String) restore.putString(entry.getKey(), (String) value);
                    else if (value instanceof Long) restore.putLong(entry.getKey(), (Long) value);
                    else if (value instanceof Integer) restore.putInt(entry.getKey(), (Integer) value);
                    else throw new AssertionError("Unexpected update preference type");
                }
                restore.commit();
            }
            press("账号");
            press("应用更新"); // The entry opens the update dialog in place; there is no second page.
            waitFor("当前版本 " + version);
            verify("Installed UI uses real Android version through host bridge", true);
            // The dialog reports the honest release state: no usable release means a retryable
            // failure, a published release older than this build means "already latest".
            boolean unavailable = has("无法检查更新");
            String primary = unavailable ? "检查更新" : "再次检查";
            verify("Check result is honest for the current release state",
                    unavailable || has("已是最新版本"));
            SystemClock.sleep(250);
            verify("Dialog primary receives native keyboard focus", focused(primary));
            File directory = new File(activity.getExternalFilesDir(null), "updates");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new AssertionError("screenshot directory");
            Bitmap image = runner.getUiAutomation().takeScreenshot();
            try (FileOutputStream output = new FileOutputStream(new File(directory, args.getString("appearance", "light") + ".png"))) {
                image.compress(Bitmap.CompressFormat.PNG, 100, output);
            }
            image.recycle();
            // Remote BACK dismisses the dialog and restores the entry's focus; a press can be
            // consumed while the host settles, so repeat until the row holds focus again.
            boolean returned = false;
            for (int attempt = 0; attempt < 3 && !returned; attempt++) {
                runner.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
                SystemClock.sleep(1500);
                returned = focused("应用更新");
            }
            verify("Returning restores the update entry", returned);
            result.putString("stream", "PASS update acceptance " + checks + " checks\n");
            activity.finish();
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable failure) {
            result.putString("stream", "FAIL " + failure + "\n" + describe(runner.getUiAutomation().getRootInActiveWindow()));
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
