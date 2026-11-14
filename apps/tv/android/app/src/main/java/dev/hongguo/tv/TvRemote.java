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
    private int currentPageDepth = -1;
    private View currentPageRoot;
    private final List<SavedFocus> coveredFocus = new ArrayList<>();
    private final List<SavedFocus> recentFocus = new ArrayList<>();
    private static final class SavedFocus {
        final View view;
        final String identity;
        final int depth;
        final View pageRoot;
        SavedFocus(View view, String identity, int depth, View pageRoot) { this.view = view; this.identity = identity; this.depth = depth; this.pageRoot = pageRoot; }
    }
    private int previousIndex;
    private boolean selecting;
    private long focusPlaybackUntil;
    private View currentScope;
    private boolean focusSelection;
    private int pageDepth = -1;
    private int observedPageDepth = -1;
    private View pageRoot;
    private View observedPageRoot;
    private boolean restoringPage;
    private long focusIntent;

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
                if (targets.contains(newFocus)) select(newFocus, targets);
                else if (current != null && !targets.contains(current)) restore();
            }
        });
        root.getViewTreeObserver().addOnPreDrawListener(() -> {
            if ((root.isFocused() && !(current instanceof EditText)) || restoringPage || current == null || !current.isAttachedToWindow() || !current.isShown()
                    || !current.createAccessibilityNodeInfo().isEnabled()
                    || android.os.SystemClock.uptimeMillis() < focusPlaybackUntil) restore();
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
        // A Select list is a portal beside its parent sheet, so resolve it before dialogs.
        View modal = expandedSelect(root) ? scope(root, true) : null;
        if (modal == null) modal = scope(root, false);
        if (currentScope != modal) {
            currentScope = modal;
            focusSelection = modal != null && "android.widget.ListView".equals(
                    String.valueOf(modal.createAccessibilityNodeInfo().getClassName()));
        }
        observedPageDepth = -1;
        observedPageRoot = null;
        collect(modal == null ? root : modal, targets);
        if (observedPageDepth >= 0) {
            if (pageDepth >= 0 && observedPageDepth != pageDepth)
                restoringPage = observedPageDepth < pageDepth;
            pageDepth = observedPageDepth;
            pageRoot = observedPageRoot;
        }
        return targets;
    }

    private View scope(View view, boolean list) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return null;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = group.getChildCount() - 1; i >= 0; i--) {
                View modal = scope(group.getChildAt(i), list);
                if (modal != null) return modal;
            }
        }
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        if (node == null) return null;
        String role = String.valueOf(node.getExtras().getCharSequence("AccessibilityNodeInfo.roleDescription"));
        String name = String.valueOf(node.getContentDescription());
        // Android <30 lacks NSH's spoken dialog role; keep the shared panel names as its fallback.
        boolean playerPanel = !node.isClickable() && (name.equals("播放设置") || name.equals("选集"));
        boolean matches = list ? "android.widget.ListView".equals(String.valueOf(node.getClassName()))
                : role.equals("dialog") || role.equals("alert dialog") || playerPanel
                    || "android.app.Dialog".equals(String.valueOf(node.getClassName()));
        return matches ? view : null;
    }

    private boolean expandedSelect(View view) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return false;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        if (node != null && "android.widget.Spinner".equals(String.valueOf(node.getClassName()))
                && node.getActionList().contains(AccessibilityNodeInfo.AccessibilityAction.ACTION_COLLAPSE)) return true;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++)
                if (expandedSelect(group.getChildAt(i))) return true;
        }
        return false;
    }

    private void collect(View view, List<View> targets) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return;
        Rect visible = new Rect();
        if (!view.getGlobalVisibleRect(visible)) return;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        String id = node == null ? null : node.getViewIdResourceName();
        if (id != null && id.matches("navigation-page-[0-9]{1,3}")) {
            observedPageDepth = Integer.parseInt(id.substring("navigation-page-".length()));
            observedPageRoot = view;
        }
        boolean actionable = node != null && node.isEnabled()
                && (node.isClickable() || adjustable(node) || view instanceof EditText);
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
        // Public surface IDs opt nonmodal overlays into occlusion, including inter-row gaps.
        if (id != null && id.startsWith("focus-surface-")) {
            Rect surface = bounds(view);
            targets.removeIf(target -> {
                Rect targetBounds = bounds(target);
                return surface.contains(targetBounds.centerX(), targetBounds.centerY());
            });
        }
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) collect(group.getChildAt(i), targets);
        }
    }

    private void select(View view, List<View> targets) {
        if (current != view) {
            if (current != null) {
                recentFocus.removeIf(saved -> saved.view == current);
                recentFocus.add(new SavedFocus(current, currentIdentity, currentPageDepth, currentPageRoot));
                if (recentFocus.size() > 32) recentFocus.remove(0);
            }
            current = view;
            currentIdentity = identity(view);
            currentPageDepth = pageDepth;
            currentPageRoot = pageRoot;
            previousIndex = Math.max(0, targets.indexOf(view));
            if (view != null) {
                selecting = true;
                view.setFocusable(true);
                view.requestFocus();
                // Returning through the input can reopen the IME before a suggestion remounts.
                if (!(view instanceof EditText))
                    ((InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE))
                            .hideSoftInputFromWindow(view.getWindowToken(), 0);
                root.send("focus-identity", focusIdentity(view));
                selecting = false;
                AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
                Log.i("TVFocus", String.valueOf(node.getText()) + " " + node.getContentDescription());
            }
        }
        invalidate();
    }

    private String focusIdentity(View view) {
        for (View candidate = view; candidate != null;) {
            String id = candidate.createAccessibilityNodeInfo().getViewIdResourceName();
            if (id != null) return id;
            android.view.ViewParent parent = candidate.getParent();
            candidate = parent instanceof View ? (View) parent : null;
        }
        return "outside";
    }

    private void restore() {
        if (selecting) return;
        List<View> targets = targets();
        if (current != null && !targets.contains(current)) {
            // Android press-target refs do not restore native focus; retain the covered source identity.
            coveredFocus.removeIf(saved -> saved.view == current);
            coveredFocus.add(new SavedFocus(current, currentIdentity, currentPageDepth, currentPageRoot));
            if (coveredFocus.size() > 32) coveredFocus.remove(0);
        }
        if (focusSelection) {
            for (View target : targets) {
                if (target.createAccessibilityNodeInfo().isSelected()) {
                    focusSelection = false;
                    coveredFocus.removeIf(saved -> targets.contains(saved.view));
                    select(target, targets);
                    return;
                }
            }
        }
        if (android.os.SystemClock.uptimeMillis() < focusPlaybackUntil) {
            for (View target : targets) {
                String name = String.valueOf(target.createAccessibilityNodeInfo().getContentDescription());
                if (name.equals("播放") || name.equals("暂停")) {
                    focusPlaybackUntil = 0;
                    coveredFocus.removeIf(saved -> targets.contains(saved.view));
                    select(target, targets);
                    return;
                }
            }
        }
        View focused = root.findFocus();
        View source = null;
        SavedFocus waitingSource = null;
        if (restoringPage) {
            for (int i = coveredFocus.size() - 1; i >= 0; i--) {
                SavedFocus saved = coveredFocus.get(i);
                if (saved.pageRoot == pageRoot && saved.depth == pageDepth && saved.identity != null && saved.identity.startsWith("id:")) {
                    waitingSource = saved;
                    break;
                }
            }
        }
        for (int i = coveredFocus.size() - 1; i >= 0; i--) {
            SavedFocus saved = coveredFocus.get(i);
            if (restoringPage && saved.pageRoot != pageRoot) continue;
            if (waitingSource != null && saved != waitingSource) continue;
            source = resurfaced(saved, targets);
            if (source != null) break;
        }
        if (source == null && restoringPage && waitingSource == null) {
            // A pointer/accessibility click can select a return stop without moving Android focus.
            for (View target : targets)
                if (target.createAccessibilityNodeInfo().isSelected()) { source = target; break; }
            restoringPage = false;
        }
        if (source != null) {
            // One resurfaced layer restores once; older sources in that layer must not steal it later.
            coveredFocus.removeIf(saved -> restoringPage && saved.depth == pageDepth || resurfaced(saved, targets) != null);
            restoringPage = false;
            select(source, targets);
        }
        else if (!targets.contains(current)) {
            View selected = null;
            for (int i = recentFocus.size() - 1; i >= 0; i--) {
                SavedFocus saved = recentFocus.get(i);
                if (targets.contains(saved.view) && java.util.Objects.equals(saved.identity, identity(saved.view))) {
                    selected = saved.view;
                    break;
                }
            }
            for (View target : targets)
                if (selected == null && target.createAccessibilityNodeInfo().isSelected()) { selected = target; break; }
            select(targets.contains(focused) ? focused : selected != null ? selected
                    : targets.isEmpty() ? null : targets.get(Math.min(previousIndex, targets.size() - 1)), targets);
        } else if (targets.contains(focused) && focused != current) select(focused, targets);
        // A Select may focus the NSH root after restoration; an input can deliberately blur on submit.
        if (root.isFocused() && !(current instanceof EditText) && targets.contains(current)) {
            selecting = true;
            try { current.requestFocus(); } finally { selecting = false; }
        }
        // Pre-draw owns geometry invalidation. An unresolved source must not schedule a render loop.
    }

    private View resurfaced(SavedFocus saved, List<View> targets) {
        if (targets.contains(saved.view) && java.util.Objects.equals(saved.identity, identity(saved.view)))
            return saved.view;
        // A refetched virtual row may have a new native View. Only a stable public ID can reconnect it.
        if (restoringPage && saved.pageRoot == pageRoot && saved.depth == pageDepth && saved.identity != null && saved.identity.startsWith("id:"))
            for (View target : targets)
                if (saved.identity.equals(identity(target))) return target;
        return null;
    }

    private String identity(View view) {
        if (view == null) return null;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        if (node != null && node.getViewIdResourceName() != null)
            return "id:" + node.getViewIdResourceName();
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
        if (event.getAction() == KeyEvent.ACTION_DOWN) noteFocusIntent();
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
        String mediaCommand = switch (key) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "toggle";
            case KeyEvent.KEYCODE_MEDIA_PLAY -> "play";
            case KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_MEDIA_STOP -> "pause";
            case KeyEvent.KEYCODE_MEDIA_NEXT -> "next";
            case KeyEvent.KEYCODE_MEDIA_REWIND -> "seek-back";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "seek-forward";
            default -> null;
        };
        if (mediaCommand != null) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                if ((mediaCommand.equals("pause") || mediaCommand.equals("toggle"))
                        && scope(root, false) == null && !expandedSelect(root))
                    focusPlaybackUntil = android.os.SystemClock.uptimeMillis() + 1000;
                root.send("player-command", mediaCommand);
            }
            return true;
        }
        if (key != KeyEvent.KEYCODE_DPAD_UP && key != KeyEvent.KEYCODE_DPAD_DOWN
                && key != KeyEvent.KEYCODE_DPAD_LEFT && key != KeyEvent.KEYCODE_DPAD_RIGHT
                && key != KeyEvent.KEYCODE_DPAD_CENTER && key != KeyEvent.KEYCODE_ENTER) return false;
        if (event.getAction() != KeyEvent.ACTION_DOWN) return true;
        // The enabled semantic stage owns hidden controls and uncommitted seek previews.
        // Visible controls keep the ordinary geometric navigation below.
        String stage = playerStage(root);
        if (stage != null && (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT
                || key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER)) {
            String command = key == KeyEvent.KEYCODE_DPAD_LEFT ? "preview-back"
                    : key == KeyEvent.KEYCODE_DPAD_RIGHT ? "preview-forward"
                    : stage.equals("确认播放位置") ? "confirm" : "reveal";
            if (event.getRepeatCount() == 0 || key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT) {
                if (command.equals("confirm") || command.equals("reveal"))
                    focusPlaybackUntil = android.os.SystemClock.uptimeMillis() + 1000;
                root.send("player-command", command);
            }
            return true;
        }
        List<View> targets = targets();
        cancelPageRestoration(); // This collection may be the first to observe the return.
        if (targets.isEmpty()) return false;
        if (focusSelection) restore();
        focusSelection = false; // A user's movement takes precedence over late-mounted selected rows.
        if (!targets.contains(current)) select(targets.get(0), targets);
        AccessibilityNodeInfo currentNode = current.createAccessibilityNodeInfo();
        if (currentNode != null && adjustable(currentNode)
                && (key == KeyEvent.KEYCODE_DPAD_LEFT || key == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            int action = key == KeyEvent.KEYCODE_DPAD_LEFT ? AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
                    : AccessibilityNodeInfo.ACTION_SCROLL_FORWARD;
            if (current.performAccessibilityAction(action, null)) return true;
        }
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

    private void cancelPageRestoration() {
        if (restoringPage) coveredFocus.removeIf(saved -> saved.depth == pageDepth);
        restoringPage = false;
    }

    void noteFocusIntent() {
        focusIntent++;
        targets();
        cancelPageRestoration();
        root.send("focus-intent", "");
    }

    private String playerStage(View view) {
        if (!view.isShown() || !view.isEnabled() || view.getAlpha() == 0
                || view.getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return null;
        AccessibilityNodeInfo node = view.createAccessibilityNodeInfo();
        String name = node == null || node.getContentDescription() == null ? "" : node.getContentDescription().toString();
        if (node != null && node.isEnabled() && node.isClickable()
                && (name.equals("显示播放控制") || name.equals("确认播放位置"))) return name;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                String stage = playerStage(group.getChildAt(i));
                if (stage != null) return stage;
            }
        }
        return null;
    }

    private boolean adjustable(AccessibilityNodeInfo node) {
        return node.getRangeInfo() != null || "android.widget.SeekBar".equals(String.valueOf(node.getClassName()));
    }

    private View nearest(List<View> targets, Rect from, int key) {
        View best = null;
        double bestScore = Double.POSITIVE_INFINITY;
        boolean bestInRow = false;
        for (View target : targets) {
            if (target == current) continue;
            Rect to = bounds(target);
            int dx = to.centerX() - from.centerX(), dy = to.centerY() - from.centerY();
            int major = key == KeyEvent.KEYCODE_DPAD_RIGHT ? dx : key == KeyEvent.KEYCODE_DPAD_LEFT ? -dx
                    : key == KeyEvent.KEYCODE_DPAD_DOWN ? dy : -dy;
            int minor = key == KeyEvent.KEYCODE_DPAD_RIGHT || key == KeyEvent.KEYCODE_DPAD_LEFT ? Math.abs(dy) : Math.abs(dx);
            if (major <= 0) continue;
            boolean inRow = key == KeyEvent.KEYCODE_DPAD_RIGHT || key == KeyEvent.KEYCODE_DPAD_LEFT
                    ? to.bottom > from.top && to.top < from.bottom
                    : to.right > from.left && to.left < from.right;
            double score = major * (double) major + 13 * minor * (double) minor;
            // Stay in the current row/column before crossing to a distant slider thumb.
            if (best == null || inRow && !bestInRow || inRow == bestInRow && score < bestScore) {
                best = target; bestScore = score; bestInRow = inRow;
            }
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
            long ownedIntent = focusIntent;
            root.postDelayed(() -> {
                if (ownedIntent != focusIntent || !viewport.isAttachedToWindow()) return;
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
