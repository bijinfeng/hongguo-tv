package dev.hongguo.tv;

import android.util.Log;
import com.longbridge.nsh.NshView;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.android.core.SentryAndroid;
import io.sentry.protocol.Message;
import java.util.LinkedHashMap;
import java.util.Map;
/**
 * Diagnostics reporting, off until the user turns it on.
 *
 * The app sends two channels: {@code diagnostics.consent} carries the switch, and
 * {@code diagnostics.report} carries one already-sanitized failure. Nothing is initialized and
 * no request is made while consent is off, and every call is guarded so a reporting failure
 * can never break the path that reported it.
 *
 * This uses the official `sentry-android` SDK. That is why the host builds with
 * `android.useAndroidX=true`: the SDK's runtime dependencies are androidx libraries. NSH's
 * own host classes reference none, so enabling AndroidX here affects only dependencies.
 */
final class DiagnosticsReporter {
    private static final String TAG = "HongguoTV";

    private final NshView nsh;
    private final String dsn;
    private boolean enabled;

    DiagnosticsReporter(NshView nsh, String dsn) {
        this.nsh = nsh;
        this.dsn = dsn == null ? "" : dsn;
        nsh.handle("diagnostics.consent", (data, reply) -> {
            boolean on = data instanceof Boolean && (Boolean) data;
            try {
                reply.resolve(setEnabled(on));
            } catch (RuntimeException error) {
                Log.w(TAG, "diagnostics consent failed", error);
                reply.resolve(false);
            }
        });
        nsh.handle("diagnostics.report", (data, reply) -> {
            try {
                capture(data);
            } catch (RuntimeException error) {
                Log.w(TAG, "diagnostics report failed", error);
            }
            reply.resolve(null);
        });
    }

    /** Whether a DSN exists at all; without one the switch has nothing to switch on. */
    boolean available() {
        return !dsn.isEmpty();
    }

    /**
     * Applies the user's choice. The SDK is initialized only on consent, so a device that never
     * opted in has no reporter, no uncaught handler and no network traffic from it.
     */
    synchronized boolean setEnabled(boolean on) {
        if (on && !available()) return false;
        if (on == enabled) return true;
        if (on) {
            SentryAndroid.init(nsh.getContext(), options -> {
                options.setDsn(dsn);
                options.setRelease(BuildConfig.VERSION_NAME + "+" + BuildConfig.VERSION_CODE);
                options.setEnvironment("production");
                options.setSendDefaultPii(false);
                // Failure reports only: no traces, replays, sessions or ANR detection.
                options.setTracesSampleRate(null);
                options.setEnableAutoSessionTracking(false);
                options.setEnableNdk(false);
                options.setAnrEnabled(false);
                options.setAttachThreads(false);
            });
        } else {
            io.sentry.Sentry.close();
        }
        enabled = on;
        return true;
    }

    /** Forwards an engine-level fatal error; the local log line stays the caller's job. */
    void captureFatal(String message) {
        if (!enabled || message == null || message.isEmpty()) return;
        try {
            SentryEvent event = new SentryEvent();
            Message body = new Message();
            body.setMessage(message);
            event.setMessage(body);
            event.setLevel(SentryLevel.FATAL);
            event.setTag("source", "engine");
            io.sentry.Sentry.captureEvent(event);
        } catch (RuntimeException error) {
            Log.w(TAG, "diagnostics capture failed", error);
        }
    }

    /** Turns one app-sent event into a Sentry event, keeping only the agreed fields. */
    private void capture(Object data) {
        if (!enabled || !(data instanceof Map)) return;
        Map<?, ?> fields = (Map<?, ?>) data;
        String operation = text(fields.get("operation"));
        String message = text(fields.get("message"));
        SentryEvent event = new SentryEvent();
        Message body = new Message();
        body.setMessage(message != null ? message : operation);
        event.setMessage(body);
        event.setLevel(SentryLevel.ERROR);
        Map<String, String> tags = new LinkedHashMap<>();
        putTag(tags, "category", text(fields.get("category")));
        putTag(tags, "code", text(fields.get("code")));
        putTag(tags, "operation", operation);
        putTag(tags, "platform", text(fields.get("platform")));
        putTag(tags, "session", text(fields.get("session")));
        event.setTags(tags);
        String stack = text(fields.get("stack"));
        if (stack != null) event.setExtra("stack", stack);
        io.sentry.Sentry.captureEvent(event);
    }

    private static void putTag(Map<String, String> tags, String key, String value) {
        if (value != null && !value.isEmpty()) tags.put(key, value);
    }

    private static String text(Object value) {
        return value instanceof String && !((String) value).isEmpty() ? (String) value : null;
    }
}
