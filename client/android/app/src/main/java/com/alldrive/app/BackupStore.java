package com.alldrive.app;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;

/** Settings, encrypted Google tokens and the "already uploaded" ledger for photo backup. */
final class BackupStore {
    static final String PREFS = "alldrive_backup";
    private static final String SECURE_PREFS = "alldrive_secure_tokens";

    static final String KEY_ENABLED = "enabled";
    static final String KEY_EMAIL = "email";
    static final String KEY_WIFI_ONLY = "wifiOnly";
    static final String KEY_API_BASE = "apiBase";
    static final String KEY_SINCE_DATE = "sinceDate"; // MediaStore DATE_ADDED (seconds) watermark
    static final String KEY_SINCE_ID = "sinceId";
    static final String KEY_UPLOADED = "uploadedCount";
    static final String KEY_LAST_RUN = "lastRunAt";
    static final String KEY_LAST_ERROR = "lastError";
    static final String KEY_NEEDS_RECONNECT = "needsReconnect";

    /** Google revoked access (or the Photos permission is missing); the user must reconnect. */
    static final class ReauthException extends Exception {
        ReauthException(String message) { super(message); }
    }

    private BackupStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Keystore-backed; allowBackup is off so the encrypted values never outlive their key. */
    private static SharedPreferences secure(Context c) throws IOException {
        try {
            String masterKey = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
            return EncryptedSharedPreferences.create(
                SECURE_PREFS, masterKey, c,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        } catch (GeneralSecurityException e) {
            throw new IOException("Secure storage unavailable", e);
        }
    }

    static synchronized void saveAccount(Context c, String email, String refreshToken, String apiBase) throws IOException {
        secure(c).edit()
            .putString("rt:" + email, refreshToken)
            .remove("at:" + email)
            .remove("exp:" + email)
            .apply();
        SharedPreferences.Editor e = prefs(c).edit().putString(KEY_API_BASE, apiBase);
        if (email.equals(prefs(c).getString(KEY_EMAIL, ""))) e.putBoolean(KEY_NEEDS_RECONNECT, false).putString(KEY_LAST_ERROR, "");
        e.apply();
    }

    static synchronized void removeAccount(Context c, String email) throws IOException {
        secure(c).edit().remove("rt:" + email).remove("at:" + email).remove("exp:" + email).apply();
    }

    static boolean hasAccount(Context c, String email) throws IOException {
        return secure(c).contains("rt:" + email);
    }

    /** Cached access token, refreshed through the AllDrive server when it is about to expire. */
    static synchronized String[] accessToken(Context c, String email, boolean forceRefresh) throws IOException, ReauthException {
        SharedPreferences s = secure(c);
        String refreshToken = s.getString("rt:" + email, null);
        if (refreshToken == null) throw new ReauthException("No saved sign-in for " + email + ". Connect the account again.");
        String cached = s.getString("at:" + email, null);
        long exp = s.getLong("exp:" + email, 0);
        if (!forceRefresh && cached != null && exp - System.currentTimeMillis() > 60_000) {
            return new String[] { cached, String.valueOf(exp) };
        }
        String apiBase = prefs(c).getString(KEY_API_BASE, "");
        if (!apiBase.startsWith("https://")) throw new IOException("Server address is not configured");

        HttpURLConnection conn = (HttpURLConnection) new URL(apiBase + "/drives/mobile-refresh").openConnection();
        try {
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(30_000);
            conn.setReadTimeout(90_000); // the free Render tier can take a while to wake up
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("refreshToken", refreshToken).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) { out.write(body); }
            int code = conn.getResponseCode();
            if (code == 401) throw new ReauthException("Google access was revoked. Reconnect " + email + ".");
            if (code != 200) throw new IOException("Token refresh failed (HTTP " + code + ")");
            JSONObject json = new JSONObject(readAll(conn.getInputStream()));
            String token = json.getString("accessToken");
            long expiresAt = json.getLong("expiresAt");
            s.edit().putString("at:" + email, token).putLong("exp:" + email, expiresAt).apply();
            return new String[] { token, String.valueOf(expiresAt) };
        } catch (org.json.JSONException e) {
            throw new IOException("Unexpected server response", e);
        } finally {
            conn.disconnect();
        }
    }

    static String readAll(InputStream in) throws IOException {
        if (in == null) return "";
        try (InputStream is = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            for (int n; (n = is.read(buf)) > 0; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    // ---- uploaded ledger: avoids duplicates when "back up existing" rescans older media ----

    private static final class Ledger extends SQLiteOpenHelper {
        Ledger(Context c) { super(c, "alldrive_backup.db", null, 1); }
        @Override public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE uploaded (media_id INTEGER NOT NULL, account TEXT NOT NULL, PRIMARY KEY (media_id, account))");
        }
        @Override public void onUpgrade(SQLiteDatabase db, int oldV, int newV) {}
    }

    private static Ledger ledger;

    private static synchronized SQLiteDatabase db(Context c) {
        if (ledger == null) ledger = new Ledger(c.getApplicationContext());
        return ledger.getWritableDatabase();
    }

    static boolean isUploaded(Context c, long mediaId, String account) {
        try (android.database.Cursor cur = db(c).rawQuery(
                "SELECT 1 FROM uploaded WHERE media_id=? AND account=?",
                new String[] { String.valueOf(mediaId), account })) {
            return cur.moveToFirst();
        }
    }

    static void markUploaded(Context c, long mediaId, String account) {
        ContentValues v = new ContentValues();
        v.put("media_id", mediaId);
        v.put("account", account);
        db(c).insertWithOnConflict("uploaded", null, v, SQLiteDatabase.CONFLICT_IGNORE);
    }
}
