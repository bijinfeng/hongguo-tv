package dev.hongguo.tv;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.storage.StorageManager;
import android.provider.Settings;
import com.longbridge.nsh.NshView;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.zip.ZipFile;
import org.json.JSONObject;

/** Android alone owns permissions, APK identity and system installation; no content API involved. */
final class UpdateInstaller {
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();

    UpdateInstaller(Activity activity, NshView nsh) {
        this.activity = activity;
        nsh.handle("update.info", (args, reply) -> {
            try { reply.resolve(info(activity)); } catch (Exception error) { reply.reject("无法读取安装版本"); }
        });
        nsh.handle("update.allocate", (args, reply) -> worker.execute(() -> {
            try {
                long bytes = ((Number) args).longValue();
                if (bytes <= 0 || bytes > 1100L * 1024 * 1024) throw new Exception("更新包大小不可用");
                StorageManager storage = activity.getSystemService(StorageManager.class);
                storage.allocateBytes(storage.getUuidForPath(activity.getFilesDir()), bytes);
                reply.resolve(null);
            } catch (Exception error) { reply.reject("空间不足，请清理空间后重试"); }
        }));
        nsh.handle("update.permission", (args, reply) -> {
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.getPackageName())));
                reply.resolve(null);
            } catch (Exception error) { reply.reject("无法打开安装授权设置"); }
        });
        nsh.handle("update.install", (args, reply) -> {
            if (!busy.compareAndSet(false, true)) { reply.reject("安装正在进行"); return; }
            worker.execute(() -> {
                try {
                    JSONObject request = new JSONObject((String) args);
                    if (!activity.getPackageManager().canRequestPackageInstalls()) {
                        reply.resolve("permission");
                        return;
                    }
                    install(request);
                    reply.resolve("installing");
                } catch (Exception error) {
                    reply.reject(error.getMessage() == null ? "更新安装失败，请重试" : error.getMessage());
                } finally { busy.set(false); }
            });
        });
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("application-update", Context.MODE_PRIVATE);
    }
    static long version(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }
    static Map<String, Object> info(Context context) throws Exception {
        PackageInfo installed = packageInfo(context);
        SharedPreferences prefs = prefs(context);
        long expected = prefs.getLong("expected", 0);
        String state = prefs.getString("state", "idle");
        if (expected > 0 && version(installed) == expected) {
            state = "success";
            // Consume the receipt once; an older success must not hide the next staged update.
            prefs.edit().remove("expected").remove("session").putString("state", "idle").apply();
        } else if ("success".equals(state)) {
            state = "idle";
            prefs.edit().putString("state", state).apply();
        } else if ("installing".equals(state)) {
            int id = prefs.getInt("session", -1);
            if (context.getPackageManager().getPackageInstaller().getSessionInfo(id) == null) {
                state = "installError";
                prefs.edit().putString("state", state).apply();
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("version", installed.versionName);
        result.put("build", version(installed));
        result.put("freeBytes", context.getSystemService(StorageManager.class).getAllocatableBytes(
                context.getSystemService(StorageManager.class).getUuidForPath(context.getFilesDir())));
        result.put("permission", context.getPackageManager().canRequestPackageInstalls());
        result.put("state", state);
        result.put("message", prefs.getString("message", ""));
        return result;
    }
    @SuppressWarnings("deprecation")
    static PackageInfo packageInfo(Context context) throws Exception {
        return context.getPackageManager().getPackageInfo(context.getPackageName(), signatureFlags());
    }
    @SuppressWarnings("deprecation")
    private static int signatureFlags() {
        return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
    }
    @SuppressWarnings("deprecation")
    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
                ? info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners() : info.signatures;
        Set<String> result = new HashSet<>();
        if (signatures != null) for (Signature signature : signatures)
            result.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        return result;
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }

    private void install(JSONObject request) throws Exception {
        File file = new File(request.getString("path")).getCanonicalFile();
        File permitted = new File(activity.getFilesDir(), "nsh/" + activity.getPackageName() + "/updates/update.apk").getCanonicalFile();
        if (!file.equals(permitted) || !file.isFile()) throw new Exception("更新包不可用，请重新下载");
        JSONObject metadata = request.getJSONObject("manifest");
        JSONObject p = metadata.getJSONObject("platforms").getJSONObject("android");
        long size = p.getLong("size");
        long build = p.getLong("versionCode");
        String certificate = BuildConfig.UPDATE_CERTIFICATE_SHA256;
        if (size <= 0 || size > 512L * 1024 * 1024 || file.length() != size
                || !certificate.equals(p.getString("signingCertificateSha256")))
            throw new Exception("更新包验证失败，请重新下载");
        StorageManager storage = activity.getSystemService(StorageManager.class);
        storage.allocateBytes(storage.getUuidForPath(activity.getFilesDir()), size + 32L * 1024 * 1024);
        PackageInfo installed = packageInfo(activity);
        PackageInfo archive = activity.getPackageManager().getPackageArchiveInfo(file.getPath(), signatureFlags());
        if (archive == null || archive.applicationInfo == null
                || !activity.getPackageName().equals(archive.packageName)
                || !archive.packageName.equals(p.getString("packageName"))
                || version(archive) != build || build <= version(installed)
                || !metadata.getString("version").equals(archive.versionName)
                || archive.applicationInfo.minSdkVersion != p.getInt("minSdk")
                || archive.applicationInfo.minSdkVersion > Build.VERSION.SDK_INT
                || !signers(archive).equals(java.util.Collections.singleton(certificate))
                || !signers(installed).equals(signers(archive)))
            throw new Exception("更新包与当前应用不匹配，请重新下载");
        Set<String> abis = new HashSet<>();
        try (ZipFile zip = new ZipFile(file)) {
            java.util.Enumeration<? extends java.util.zip.ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                if (name.startsWith("lib/") && name.endsWith(".so")) {
                    String[] parts = name.split("/");
                    if (parts.length == 3) abis.add(parts[1]);
                }
            }
        }
        Set<String> declared = new HashSet<>();
        for (int i = 0; i < p.getJSONArray("abis").length(); i++) declared.add(p.getJSONArray("abis").getString(i));
        if (!abis.equals(java.util.Collections.singleton("arm64-v8a")) || !abis.equals(declared)
                || !java.util.Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"))
            throw new Exception("更新包不支持此设备");
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        // Never leave an earlier abandoned session consuming disk space.
        int previous = prefs(activity).getInt("session", -1);
        if (previous >= 0 && installer.getSessionInfo(previous) != null) installer.abandonSession(previous);
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        params.setSize(size);
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
        int id = installer.createSession(params);
        boolean committed = false;
        try (PackageInstaller.Session session = installer.openSession(id)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long count = 0;
            try (FileInputStream input = new FileInputStream(file);
                    OutputStream output = session.openWrite("base.apk", 0, size)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = input.read(buffer)) != -1) {
                    count += n;
                    if (count > size) throw new Exception("更新包验证失败");
                    digest.update(buffer, 0, n);
                    output.write(buffer, 0, n);
                }
                session.fsync(output);
            }
            if (count != size || !hex(digest.digest()).equals(p.getString("sha256")))
                throw new Exception("更新包验证失败，请重新下载");
            if (!prefs(activity).edit().putLong("expected", build).putInt("session", id)
                    .putString("state", "installing").putString("message", "").commit())
                throw new Exception("无法保存安装状态");
            Intent callback = new Intent(activity, UpdateResultReceiver.class)
                    .setAction(activity.getPackageName() + ".UPDATE_RESULT");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(activity, id, callback, flags);
            session.commit(pending.getIntentSender());
            committed = true;
        } finally {
            if (!committed) {
                installer.abandonSession(id);
                prefs(activity).edit().putString("state", "installError").apply();
            }
        }
    }

    void close() { worker.shutdown(); }
}
