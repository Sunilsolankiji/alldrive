package com.alldrive.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** JS bridge for automatic photo backup; see client/src/api/photoBackup.ts for the contract. */
@CapacitorPlugin(
    name = "PhotoBackup",
    permissions = {
        @Permission(alias = "photos", strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_MEDIA_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }),
    }
)
public class PhotoBackupPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private Context ctx() { return getContext().getApplicationContext(); }

    private static String requireString(PluginCall call, String key) {
        String v = call.getString(key);
        if (v == null || v.trim().isEmpty()) {
            call.reject("Missing " + key, "invalid_argument");
            return null;
        }
        return v;
    }

    @PluginMethod
    public void saveAccount(PluginCall call) {
        String email = requireString(call, "email");
        String refreshToken = email == null ? null : requireString(call, "refreshToken");
        String apiBase = refreshToken == null ? null : requireString(call, "apiBase");
        if (apiBase == null) return;
        if (!apiBase.startsWith("https://")) { call.reject("apiBase must be an https URL", "invalid_argument"); return; }
        io.execute(() -> {
            try {
                BackupStore.saveAccount(ctx(), email, refreshToken, apiBase);
                SharedPreferences p = BackupStore.prefs(ctx());
                // Reconnecting the backup account resumes backups that stopped on a revoked token
                if (p.getBoolean(BackupStore.KEY_ENABLED, false) && email.equals(p.getString(BackupStore.KEY_EMAIL, ""))) {
                    BackupWorker.runNow(ctx());
                }
                call.resolve();
            } catch (IOException e) {
                call.reject(e.getMessage(), "storage_error");
            }
        });
    }

    @PluginMethod
    public void removeAccount(PluginCall call) {
        String email = requireString(call, "email");
        if (email == null) return;
        io.execute(() -> {
            try {
                BackupStore.removeAccount(ctx(), email);
                SharedPreferences p = BackupStore.prefs(ctx());
                if (email.equals(p.getString(BackupStore.KEY_EMAIL, ""))) {
                    p.edit().putBoolean(BackupStore.KEY_ENABLED, false).apply();
                    BackupWorker.cancel(ctx());
                }
                call.resolve();
            } catch (IOException e) {
                call.reject(e.getMessage(), "storage_error");
            }
        });
    }

    @PluginMethod
    public void getAccessToken(PluginCall call) {
        String email = requireString(call, "email");
        if (email == null) return;
        boolean force = call.getBoolean("force", false);
        io.execute(() -> {
            try {
                if (!BackupStore.hasAccount(ctx(), email)) { call.reject("No saved sign-in", "no_account"); return; }
                String[] t = BackupStore.accessToken(ctx(), email, force);
                JSObject ret = new JSObject();
                ret.put("accessToken", t[0]);
                ret.put("expiresAt", Long.parseLong(t[1]));
                call.resolve(ret);
            } catch (BackupStore.ReauthException e) {
                call.reject(e.getMessage(), "reauth");
            } catch (IOException e) {
                call.reject(e.getMessage(), "network");
            }
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status());
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String email = requireString(call, "email");
        if (email == null) return;
        boolean wifiOnly = call.getBoolean("wifiOnly", true);
        io.execute(() -> {
            try {
                if (!BackupStore.hasAccount(ctx(), email)) {
                    call.reject("Reconnect " + email + " in this app first so backup can run in the background.", "no_account");
                    return;
                }
            } catch (IOException e) {
                call.reject(e.getMessage(), "storage_error");
                return;
            }
            SharedPreferences p = BackupStore.prefs(ctx());
            SharedPreferences.Editor e = p.edit()
                .putBoolean(BackupStore.KEY_ENABLED, true)
                .putBoolean(BackupStore.KEY_WIFI_ONLY, wifiOnly)
                .putBoolean(BackupStore.KEY_NEEDS_RECONNECT, false)
                .putString(BackupStore.KEY_LAST_ERROR, "");
            // Only photos taken from now on; "Back up existing photos" covers older ones
            if (!p.getBoolean(BackupStore.KEY_ENABLED, false) || !email.equals(p.getString(BackupStore.KEY_EMAIL, ""))) {
                e.putLong(BackupStore.KEY_SINCE_DATE, System.currentTimeMillis() / 1000).putLong(BackupStore.KEY_SINCE_ID, Long.MAX_VALUE);
            }
            e.putString(BackupStore.KEY_EMAIL, email).apply();
            BackupWorker.schedule(ctx());
            call.resolve(status());
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        BackupStore.prefs(ctx()).edit().putBoolean(BackupStore.KEY_ENABLED, false).apply();
        BackupWorker.cancel(ctx());
        call.resolve(status());
    }

    @PluginMethod
    public void setWifiOnly(PluginCall call) {
        Boolean wifiOnly = call.getBoolean("wifiOnly");
        if (wifiOnly == null) { call.reject("Missing wifiOnly", "invalid_argument"); return; }
        SharedPreferences p = BackupStore.prefs(ctx());
        p.edit().putBoolean(BackupStore.KEY_WIFI_ONLY, wifiOnly).apply();
        if (p.getBoolean(BackupStore.KEY_ENABLED, false)) BackupWorker.schedule(ctx());
        call.resolve(status());
    }

    @PluginMethod
    public void backupExisting(PluginCall call) {
        SharedPreferences p = BackupStore.prefs(ctx());
        if (!p.getBoolean(BackupStore.KEY_ENABLED, false)) { call.reject("Turn on backup first", "disabled"); return; }
        // Rescan from the beginning; the uploaded ledger skips files that are already backed up
        p.edit().putLong(BackupStore.KEY_SINCE_DATE, -1).putLong(BackupStore.KEY_SINCE_ID, -1).apply();
        BackupWorker.runNow(ctx());
        call.resolve(status());
    }

    @PluginMethod
    public void backupNow(PluginCall call) {
        if (!BackupStore.prefs(ctx()).getBoolean(BackupStore.KEY_ENABLED, false)) { call.reject("Turn on backup first", "disabled"); return; }
        BackupWorker.runNow(ctx());
        call.resolve(status());
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", ctx().getPackageName(), null));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        aliases.add(Build.VERSION.SDK_INT >= 33 ? "photos" : "storage");
        if (Build.VERSION.SDK_INT >= 29) aliases.add("location");
        if (Build.VERSION.SDK_INT >= 33) aliases.add("notifications");
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        SharedPreferences p = BackupStore.prefs(ctx());
        if (p.getBoolean(BackupStore.KEY_ENABLED, false) && BackupWorker.hasMediaPermission(ctx())) {
            p.edit().putString(BackupStore.KEY_LAST_ERROR, "").apply();
            BackupWorker.runNow(ctx());
        }
        call.resolve(status());
    }

    private String mediaPermissionState() {
        if (BackupWorker.hasMediaPermission(ctx())) return "granted";
        PermissionState s = getPermissionState(Build.VERSION.SDK_INT >= 33 ? "photos" : "storage");
        return s == PermissionState.DENIED ? "denied" : "prompt";
    }

    private String notificationPermissionState() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        PermissionState s = getPermissionState("notifications");
        return s == PermissionState.GRANTED ? "granted" : s == PermissionState.DENIED ? "denied" : "prompt";
    }

    private JSObject status() {
        SharedPreferences p = BackupStore.prefs(ctx());
        JSObject s = new JSObject();
        s.put("enabled", p.getBoolean(BackupStore.KEY_ENABLED, false));
        s.put("accountEmail", p.getString(BackupStore.KEY_EMAIL, ""));
        s.put("wifiOnly", p.getBoolean(BackupStore.KEY_WIFI_ONLY, true));
        s.put("running", BackupWorker.RUNNING.get());
        s.put("uploadedCount", p.getInt(BackupStore.KEY_UPLOADED, 0));
        s.put("lastRunAt", p.getLong(BackupStore.KEY_LAST_RUN, 0));
        s.put("lastError", p.getString(BackupStore.KEY_LAST_ERROR, ""));
        s.put("needsReconnect", p.getBoolean(BackupStore.KEY_NEEDS_RECONNECT, false));
        s.put("mediaPermission", mediaPermissionState());
        s.put("notificationPermission", notificationPermissionState());
        return s;
    }
}
