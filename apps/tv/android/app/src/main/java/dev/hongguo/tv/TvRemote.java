package dev.hongguo.tv;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.EditText;
import com.longbridge.nsh.NshView;
import java.util.ArrayList;
import java.util.List;

/** Remote navigation over public Android accessibility actions, without NSH internals. */
@android.annotation.SuppressLint("ViewConstructor") // Created only by MainActivity, never XML.
final class TvRemote extends View {
    private final NshView root;
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Rect drawingBounds = new Rect();
    private final int[] drawingOrigin = new int[2];
    private final Rect lastBounds = new Rect();
    private final float radius;
    private View current;
    private int previousIndex;

    TvRemote(Context context, NshView root) {
        super(context);
        this.root = root;
        radius = getResources().getDimension(R.dimen.tv_radius);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setFocusable(false);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(3 * getResources().getDisplayMetrics().density);
        ring.setColor(context.getColor(R.color.tv_ring));
        root.getViewTreeObserver().addOnGlobalLayoutListener(this::restore);
        root.getViewTreeObserver().addOnPreDrawListener(() -> {
            if (current == null || !current.isAttachedToWindow()) restore();
            Rect next = current == null ? new Rect() : bounds(current);
            if (!lastBounds.equals(next)) {
                lastBounds.set(next);
                invalidate();
            }
            return true;
        });
    }

    private List<View> targets() {
        List<View> targets = new ArrayList<>();
        collect(root, targets);
        return targets;
    }

    private void collect(View view, List<View> targets) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0) return;
        Rect visible = new Rect();
        if (!view.getGlobalVisibleRect(visible)) return;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        boolean actionable = node != null && node.isEnabled() && (node.isClickable() || view instanceof EditText);
        if (actionable) {
            targets.add(view);
            return;
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), targets);
        }
    }

    private void select(View view, List<View> targets) {
        if (current != view) {
            current = view;
            previousIndex = Math.max(0, targets.indexOf(view));
            if (view != null) {
                AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
                Log.i("TVFocus", String.valueOf(node.getText()) + " " + node.getContentDescription());
            }
        }
        invalidate();
    }

    private void restore() {
        List<View> targets = targets();
        if (!targets.contains(current)) {
            select(targets.isEmpty() ? null : targets.get(Math.min(previousIndex, targets.size() - 1)), targets);
        } else invalidate();
    }

    boolean dispatch(KeyEvent event) {
        int key = event.getKeyCode();
        // The IME keeps caret movement, composition and its own back/confirm behavior.
        if (root.findFocus() instanceof EditText) return false;
        if (key != KeyEvent.KEYCODE_DPAD_UP && key != KeyEvent.KEYCODE_DPAD_DOWN
                && key != KeyEvent.KEYCODE_DPAD_LEFT && key != KeyEvent.KEYCODE_DPAD_RIGHT
                && key != KeyEvent.KEYCODE_DPAD_CENTER && key != KeyEvent.KEYCODE_ENTER) return false;
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
        List<View> targets = targets();
        if (targets.isEmpty()) return false;
        if (!targets.contains(current)) select(targets.get(0), targets);
        if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            if (event.getRepeatCount() == 0) {
                if (current instanceof EditText) {
                    current.requestFocus();
                    ((android.view.inputmethod.InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE))
                            .showSoftInput(current, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
                } else current.performAccessibilityAction(AccessibilityNodeInfo.ACTION_CLICK, null);
            }
            return true;
        }
        Rect from = bounds(current);
        View best = null;
        double bestScore = Double.POSITIVE_INFINITY;
        for (View target : targets) {
            if (target == current) continue;
            Rect to = bounds(target);
            int dx = to.centerX() - from.centerX(), dy = to.centerY() - from.centerY();
            int major = key == KeyEvent.KEYCODE_DPAD_RIGHT ? dx : key == KeyEvent.KEYCODE_DPAD_LEFT ? -dx
                    : key == KeyEvent.KEYCODE_DPAD_DOWN ? dy : -dy;
            int minor = key == KeyEvent.KEYCODE_DPAD_RIGHT || key == KeyEvent.KEYCODE_DPAD_LEFT ? Math.abs(dy) : Math.abs(dx);
            if (major <= 0) continue;
            double score = major * (double) major + 13 * minor * (double) minor;
            if (score < bestScore) { best = target; bestScore = score; }
        }
        if (best != null) select(best, targets);
        return true;
    }

    private Rect bounds(View view) {
        Rect rect = new Rect();
        view.getGlobalVisibleRect(rect);
        return rect;
    }

    @Override protected void onDraw(Canvas canvas) {
        if (current == null || !current.isAttachedToWindow()) return;
        Rect rect = drawingBounds;
        current.getGlobalVisibleRect(rect);
        getLocationOnScreen(drawingOrigin);
        rect.offset(-drawingOrigin[0], -drawingOrigin[1]);
        float inset = ring.getStrokeWidth() / 2;
        canvas.drawRoundRect(rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset,
                radius, radius, ring);
    }
}
