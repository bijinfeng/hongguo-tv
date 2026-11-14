package dev.hongguo.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.io.File;
import java.io.FileOutputStream;
import java.util.function.BooleanSupplier;

/** Runs against the installed final APK, using remote keys and the public accessibility tree. */
public final class T0Acceptance extends Instrumentation {
    private int checks;
    private Bundle arguments;

    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        this.arguments = arguments;
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

    private boolean has(String text) {
        return find(getUiAutomation().getRootInActiveWindow(), text) != null;
    }

    private String find(AccessibilityNodeInfo node, String text) {
        if (node == null) return null;
        if (node.getText() != null && node.getText().toString().contains(text)) return node.getText().toString();
        for (int i = 0; i < node.getChildCount(); i++) {
            String found = find(node.getChild(i), text);
            if (found != null) return found;
        }
        return null;
    }

    private String playback() {
        String status = find(getUiAutomation().getRootInActiveWindow(), "video=");
        return status == null ? "" : status;
    }

    private int position() {
        java.util.regex.Matcher match = java.util.regex.Pattern.compile("time=(\\d+)").matcher(playback());
        return match.find() ? Integer.parseInt(match.group(1)) : -1;
    }

    private void key(int code) { sendKeyDownUpSync(code); SystemClock.sleep(200); }
    private void confirm() { key(KeyEvent.KEYCODE_DPAD_CENTER); }
    private void right() { key(KeyEvent.KEYCODE_DPAD_RIGHT); }

    private void screenshot(String name) throws Exception {
        File file = new File(getTargetContext().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            Bitmap image = getUiAutomation().takeScreenshot();
            if (image == null || !image.compress(Bitmap.CompressFormat.PNG, 100, out))
                throw new AssertionError("screenshot " + name);
        }
    }

    @Override public void onStart() {
        if ("native-business".equals(arguments.getString("suite"))) {
            new NativeBusinessAcceptance(this, arguments.getString("appearance", "light"), arguments.getString("phase", "watch")).run();
            return;
        }
        if ("player".equals(arguments.getString("suite"))) {
            new PlayerAcceptance(this, arguments.getString("appearance", "light")).run();
            return;
        }
        if ("suggestions".equals(arguments.getString("suite"))) {
            new BrowsingAcceptance(this, arguments.getString("appearance", "light")).run(true);
            return;
        }
        if ("browsing".equals(arguments.getString("suite"))) {
            new BrowsingAcceptance(this, arguments.getString("appearance", "light")).run();
            return;
        }
        Bundle result = new Bundle();
        try {
            Intent launch = getTargetContext().getPackageManager()
                    .getLeanbackLaunchIntentForPackage(getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("missing TV launcher");
            Activity activity = startActivitySync(launch);
            check("embedded Rust call and disposed class", () -> has("tv-t0-rust") && has("session-released"));
            check("bundled first video prepared", () -> playback().contains("video=0 loaded=true paused=true"));
            SystemClock.sleep(500);
            screenshot("t0-" + arguments.getString("appearance", "system"));
            confirm();
            check("remote confirm starts playback", () -> playback().contains("paused=false") && position() >= 1);
            confirm();
            check("remote confirm pauses", () -> playback().contains("paused=true"));
            int paused = position();
            SystemClock.sleep(1200);
            check("paused clock stays still", () -> position() == paused);
            right(); confirm();
            check("remote seek", () -> position() == 5);
            right(); confirm();
            check("remote source switch", () -> playback().contains("video=1 loaded=true") && position() == 0);
            right(); confirm();
            check("surface removed", () -> has("重建画面"));
            confirm();
            check("surface rebuilt", () -> has("移除画面") && playback().contains("loaded=true"));
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            key(KeyEvent.KEYCODE_DPAD_LEFT);
            confirm();
            check("playback after rebuilding", () -> playback().contains("paused=false") && position() >= 1);
            int beforeHome = position();
            key(KeyEvent.KEYCODE_HOME);
            SystemClock.sleep(2200);
            getTargetContext().startActivity(launch);
            check("resume after Home", () -> playback().contains("lifecycle=active") && position() >= beforeHome);
            if (position() > beforeHome + 1) throw new AssertionError("video advanced in background");
            runOnMainSync(activity::recreate);
            check("activity and video recreation", () -> has("session-released") && playback().contains("video=0 loaded=true paused=true"));
            key(KeyEvent.KEYCODE_BACK);
            check("system Back returns to TV home", () -> {
                AccessibilityNodeInfo root = getUiAutomation().getRootInActiveWindow();
                return root != null && !getTargetContext().getPackageName().contentEquals(root.getPackageName());
            });
            result.putString("stream", "TV T0 emulator acceptance: " + checks + " checks passed\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
