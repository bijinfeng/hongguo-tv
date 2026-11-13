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
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.EditorInfo;
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
    private String currentIdentity;
    private final List<SavedFocus> coveredFocus = new ArrayList<>();
    private static final class SavedFocus {
        final View view;
        final String identity;
        SavedFocus(View view, String identity) { this.view = view; this.identity = identity; }
    }
    private int previousIndex;
    private boolean selecting;

    TvRemote(Context context, NshView root) {
        super(context);
        this.root = root;
        float scale = getResources().getDisplayMetrics().widthPixels / 1920f;
        radius = getResources().getDimension(R.dimen.tv_radius) * scale
                / getResources().getDisplayMetrics().density;
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        setFocusable(false);
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(4 * scale);
        ring.setColor(context.getColor(R.color.tv_ring));
        root.getViewTreeObserver().addOnGlobalLayoutListener(this::restore);
        root.getViewTreeObserver().addOnGlobalFocusChangeListener((oldFocus, newFocus) -> {
            if (!selecting) {
                List<View> targets = targets();
                if (current != null && !targets.contains(current)) restore();
                else if (targets.contains(newFocus)) select(newFocus, targets);
            }
        });
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
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return;
        Rect visible = new Rect();
        if (!view.getGlobalVisibleRect(visible)) return;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        boolean actionable = node != null && node.isEnabled() && (node.isClickable() || view instanceof EditText);
        if (view instanceof EditText) {
            EditText input = (EditText) view;
            input.setImeOptions(input.getImeOptions() | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_FULLSCREEN);
        }
        if (actionable) {
            view.setFocusable(true);
            view.setFocusableInTouchMode(true);
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
            currentIdentity = identity(view);
            previousIndex = Math.max(0, targets.indexOf(view));
            if (view != null) {
                selecting = true;
                view.setFocusable(true);
                view.requestFocus();
                selecting = false;
                AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
                Log.i("TVFocus", String.valueOf(node.getText()) + " " + node.getContentDescription());
            }
        }
        invalidate();
    }

    private void restore() {
        if (selecting) return;
        List<View> targets = targets();
        View focused = root.findFocus();
        if (!targets.contains(current)) {
            // Android press-target refs do not implement desktop focus restoration.
            // Retain the native source only while its page is covered, including its recycled identity.
            if (current != null) {
                coveredFocus.removeIf(saved -> saved.view == current);
                coveredFocus.add(new SavedFocus(current, currentIdentity));
                if (coveredFocus.size() > 32) coveredFocus.remove(0);
            }
        }
        View source = null;
        for (int i = coveredFocus.size() - 1; i >= 0; i--) {
            SavedFocus saved = coveredFocus.get(i);
            if (targets.contains(saved.view) && java.util.Objects.equals(saved.identity, identity(saved.view))) {
                source = saved.view;
                coveredFocus.remove(i);
                break;
            }
        }
        if (source != null) select(source, targets);
        else if (!targets.contains(current)) {
            select(targets.contains(focused) ? focused
                    : targets.isEmpty() ? null : targets.get(Math.min(previousIndex, targets.size() - 1)), targets);
        } else if (targets.contains(focused) && focused != current) select(focused, targets);
        else invalidate();
    }

    private String identity(View view) {
        if (view == null) return null;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        return node == null ? null : String.valueOf(node.getContentDescription()) + "|" + node.getText();
    }

    boolean dispatchInputExit(KeyEvent event) {
        View focused = root.findFocus();
        int key = event.getKeyCode();
        return focused instanceof EditText
                && (key == KeyEvent.KEYCODE_DPAD_UP || key == KeyEvent.KEYCODE_DPAD_DOWN)
                && BaseInputConnection.getComposingSpanStart(((EditText) focused).getText()) < 0
                && dispatch(event);
    }

    boolean dispatch(KeyEvent event) {
        int key = event.getKeyCode();
        // Caret and composing text remain the IME's. Only plain vertical navigation exits editing.
        boolean exitingInput = false;
        View focused = root.findFocus();
        if (focused instanceof EditText) {
            EditText input = (EditText) focused;
            if (BaseInputConnection.getComposingSpanStart(input.getText()) >= 0
                    || (key != KeyEvent.KEYCODE_DPAD_UP && key != KeyEvent.KEYCODE_DPAD_DOWN)) return false;
            if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
            ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE))
                    .hideSoftInputFromWindow(input.getWindowToken(), 0);
            current = input;
            exitingInput = true;
        }
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
        View best = nearest(targets, from, key);
        if (best == null && exitingInput && targets.size() > 1) best = targets.get((targets.indexOf(current) + 1) % targets.size());
        if (scrollAtEdge(key, from, best)) return true;
        if (best != null) select(best, targets);
        return true;
    }

    private View nearest(List<View> targets, Rect from, int key) {
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
        return best;
    }

    /** Move a virtualized viewport when the next target is outside it. */
    private boolean scrollAtEdge(int key, Rect from, View best) {
        boolean horizontal = key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT;
        int direction = key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_UP ? -1 : 1;
        // Prefer an existing control in the same row/column before scrolling.
        if (best != null) {
            Rect to = bounds(best);
            boolean overlaps = horizontal ? to.bottom > from.top && to.top < from.bottom
                    : to.right > from.left && to.left < from.right;
            if (overlaps) return false;
        }
        for (android.view.ViewParent parent = current.getParent(); parent instanceof View; parent = parent.getParent()) {
            View viewport = (View) parent;
            if (!(horizontal ? viewport.canScrollHorizontally(direction) : viewport.canScrollVertically(direction))) continue;
            if (horizontal) {
                // One remote step advances one poster, not a whole accessibility page.
                viewport.scrollBy(direction * (from.width() + Math.round(28 * getWidth() / 1920f)), 0);
            } else {
                int action = direction > 0 ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                if (!viewport.performAccessibilityAction(action, null)) continue;
            }
            // NSH can recycle cells after the native scroll; resolve the new target after layout.
            root.postDelayed(() -> {
                List<View> next = targets();
                View candidate = null;
                double score = Double.POSITIVE_INFINITY;
                for (View target : next) {
                    boolean inside = false;
                    for (android.view.ViewParent ancestor = target.getParent(); ancestor != null; ancestor = ancestor.getParent()) {
                        if (ancestor == viewport) { inside = true; break; }
                    }
                    if (!inside) continue;
                    Rect to = bounds(target);
                    double distance = Math.abs(to.centerX() - from.centerX()) + 13 * Math.abs(to.centerY() - from.centerY());
                    if (distance < score) { candidate = target; score = distance; }
                }
                if (candidate != null) select(candidate, next);
                else restore();
            }, 160);
            return true;
        }
        return false;
    }

    private Rect bounds(View view) {
        Rect rect = new Rect();
        view.getGlobalVisibleRect(rect);
        return rect;
    }

    @Override protected void onDraw(Canvas canvas) {
        if (current == null || !current.isAttachedToWindow() || !current.isShown()) return;
        Rect rect = drawingBounds;
        current.getGlobalVisibleRect(rect);
        getLocationOnScreen(drawingOrigin);
        rect.offset(-drawingOrigin[0], -drawingOrigin[1]);
        float inset = ring.getStrokeWidth() / 2;
        canvas.drawRoundRect(rect.left + inset, rect.top + inset, rect.right - inset, rect.bottom - inset,
                radius, radius, ring);
    }
}
