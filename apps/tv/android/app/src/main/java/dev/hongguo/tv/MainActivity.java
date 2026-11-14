package dev.hongguo.tv;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.widget.FrameLayout;
import com.longbridge.nsh.NshView;

/** Thin TV adapter. Business UI and state stay in the shared TSX application. */
public final class MainActivity extends Activity {
    private NshView nsh;
    private TvRemote remote;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        nsh = new NshView(this);
        nsh.setErrorListener(message -> Log.e("HongguoTV", message));
        FrameLayout frame = new FrameLayout(this) {
            @Override public boolean dispatchTouchEvent(MotionEvent event) {
                if (remote != null && event.getActionMasked() == MotionEvent.ACTION_DOWN)
                    remote.noteFocusIntent();
                return super.dispatchTouchEvent(event);
            }
            @Override public boolean dispatchKeyEventPreIme(KeyEvent event) {
                return remote != null && remote.dispatchInputExit(event) || super.dispatchKeyEventPreIme(event);
            }
        };
        frame.addView(nsh, new FrameLayout.LayoutParams(-1, -1));
        remote = new TvRemote(this, nsh);
        frame.addView(remote, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (!nsh.loadAssetBundle("nsh")) throw new IllegalStateException("Missing NSH bundle");
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        // Android's keyboard Escape follows the same layered return as the remote Back.
        if (event.getKeyCode() == KeyEvent.KEYCODE_ESCAPE
                && !(getCurrentFocus() instanceof android.widget.EditText)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) onBackPressed();
            return true;
        }
        return remote != null && remote.dispatch(event) || super.dispatchKeyEvent(event);
    }

    @Override @SuppressWarnings("deprecation") public void onBackPressed() {
        if (!nsh.handleBack()) super.onBackPressed();
    }

    @Override protected void onDestroy() {
        nsh.destroy();
        super.onDestroy();
    }
}
