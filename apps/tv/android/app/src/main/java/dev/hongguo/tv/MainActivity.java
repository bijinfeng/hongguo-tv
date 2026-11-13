package dev.hongguo.tv;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
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
        FrameLayout frame = new FrameLayout(this);
        frame.addView(nsh, new FrameLayout.LayoutParams(-1, -1));
        remote = new TvRemote(this, nsh);
        frame.addView(remote, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        if (!nsh.loadAssetBundle("nsh")) throw new IllegalStateException("Missing NSH bundle");
    }

    @Override public boolean dispatchKeyEvent(KeyEvent event) {
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
