package dev.hongguo.tv;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import java.util.LinkedHashMap;
import java.util.Map;

/** Uses full native view bounds: accessibility bounds can conceal clipped or overlapping controls. */
final class HeaderAcceptance {
    private final Instrumentation runner;
    private final String[] labels = {"精选", "找剧", "榜单", "我的", "搜索短剧", "设置"};
    private Activity activity;

    HeaderAcceptance(Instrumentation runner) { this.runner = runner; }

    private View find(View view, String label) {
        if (!view.isShown()) return null;
        if (view.isClickable() && label.contentEquals(view.getContentDescription() == null ? "" : view.getContentDescription())) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View found = find(group.getChildAt(i), label);
                if (found != null) return found;
            }
        }
        return null;
    }

    private Rect rect(View view) {
        int[] origin = new int[2];
        view.getLocationOnScreen(origin);
        return new Rect(origin[0], origin[1], origin[0] + view.getWidth(), origin[1] + view.getHeight());
    }

    private Map<String, Rect> bounds() {
        Map<String, Rect> result = new LinkedHashMap<>();
        runner.runOnMainSync(() -> {
            View root = activity.getWindow().getDecorView();
            result.put("window", rect(root));
            for (String label : labels) {
                View view = find(root, label);
                if (view != null && view.isEnabled() && view.getWidth() > 0 && view.getHeight() > 0)
                    result.put(label, rect(view));
            }
        });
        return result;
    }

    void run() {
        Bundle result = new Bundle();
        try {
            Intent launch = runner.getTargetContext().getPackageManager().getLeanbackLaunchIntentForPackage(runner.getTargetContext().getPackageName());
            if (launch == null) throw new AssertionError("missing TV launcher");
            activity = runner.startActivitySync(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
            long until = SystemClock.uptimeMillis() + 15000;
            Map<String, Rect> controls;
            do {
                controls = bounds();
                if (controls.size() == labels.length + 1) break;
                if (SystemClock.uptimeMillis() > until) throw new AssertionError("header controls missing: " + controls);
                SystemClock.sleep(100);
            } while (true);
            Rect window = controls.get("window");
            for (String label : labels)
                if (!window.contains(controls.get(label))) throw new AssertionError("outside viewport: " + label + " " + controls);
            for (int i = 0; i < labels.length; i++)
                for (int j = i + 1; j < labels.length; j++)
                    if (Rect.intersects(controls.get(labels[i]), controls.get(labels[j])))
                        throw new AssertionError("overlapping header controls: " + labels[i] + " / " + labels[j] + " " + controls);
            result.putString("stream", "TV header acceptance: 3 checks passed\nfontScale="
                    + activity.getResources().getConfiguration().fontScale + " " + controls + "\n");
            runner.finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("stream", "FAIL " + error + "\n");
            runner.finish(Activity.RESULT_CANCELED, result);
        }
    }
}
