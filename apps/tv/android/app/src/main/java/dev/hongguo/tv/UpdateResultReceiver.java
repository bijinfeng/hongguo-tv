package dev.hongguo.tv;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

/** Explicit, non-exported callback; opening the installer never counts as update success. */
public final class UpdateResultReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!(context.getPackageName() + ".UPDATE_RESULT").equals(intent.getAction())) return;
        int session = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1);
        if (session < 0 || session != UpdateInstaller.prefs(context).getInt("session", -2)) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            @SuppressWarnings("deprecation") Intent confirmation = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirmation != null) {
                try {
                    context.startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    return;
                } catch (Exception ignored) { /* Retain the verified APK and expose a retry. */ }
            }
        }
        String state = status == PackageInstaller.STATUS_FAILURE_ABORTED ? "ready" : "installError";
        String message = status == PackageInstaller.STATUS_FAILURE_STORAGE
                ? "空间不足，请清理空间后重试" : "安装未完成，请重试";
        if (status == PackageInstaller.STATUS_SUCCESS) {
            try {
                long actual = UpdateInstaller.version(UpdateInstaller.packageInfo(context));
                if (actual == UpdateInstaller.prefs(context).getLong("expected", -1)) {
                    state = "success";
                    message = "";
                }
            } catch (Exception ignored) { /* Confirm again from the actual package on the next launch. */ }
        }
        UpdateInstaller.prefs(context).edit().putString("state", state).putString("message", message).apply();
    }
}
