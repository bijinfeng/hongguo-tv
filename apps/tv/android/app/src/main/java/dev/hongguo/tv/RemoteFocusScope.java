package dev.hongguo.tv;

import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import com.longbridge.nsh.NshComponent;
import com.longbridge.nsh.NshComponentContext;
import com.longbridge.nsh.NshView;

/** A public NSH component registers the window it actually belongs to, including native dialogs. */
final class RemoteFocusScope implements NshComponent {
    private final NshView bridge;
    private final View anchor;
    private ViewGroup windowRoot;
    private TvRemote remote;
    private boolean cinema;
    private final ViewTreeObserver.OnPreDrawListener update = () -> {
        if (remote != null && windowRoot != null) {
            remote.layout(0, 0, windowRoot.getWidth(), windowRoot.getHeight());
            remote.bindWindowKeys();
        }
        return true;
    };

    RemoteFocusScope(NshComponentContext context, NshView bridge) {
        this.bridge = bridge;
        anchor = new View(context.getContext()) {
            @Override protected void onAttachedToWindow() {
                super.onAttachedToWindow();
                attach(getRootView());
            }
            @Override protected void onDetachedFromWindow() {
                release();
                super.onDetachedFromWindow();
            }
        };
        anchor.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    }

    private void attach(View root) {
        if (!(root instanceof ViewGroup) || root == bridge.getRootView()) return;
        windowRoot = (ViewGroup) root;
        remote = new TvRemote(anchor.getContext(), bridge, windowRoot);
        remote.setCinema(cinema);
        windowRoot.getOverlay().add(remote);
        windowRoot.getViewTreeObserver().addOnPreDrawListener(update);
    }

    private void release() {
        if (windowRoot != null) {
            ViewTreeObserver observer = windowRoot.getViewTreeObserver();
            if (observer.isAlive()) observer.removeOnPreDrawListener(update);
            if (remote != null) {
                remote.dispose();
                windowRoot.getOverlay().remove(remote);
            }
        }
        windowRoot = null;
        remote = null;
    }

    @Override public View view() { return anchor; }
    @Override public void setProp(String name, Object value) {
        if ("cinema".equals(name)) {
            cinema = Boolean.TRUE.equals(value);
            if (remote != null) remote.setCinema(cinema);
        }
    }
    @Override public void destroy() { release(); }
}
