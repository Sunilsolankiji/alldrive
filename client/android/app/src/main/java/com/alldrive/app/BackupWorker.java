package com.alldrive.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.ForegroundInfo;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Uploads new photos and videos from the phone to the chosen account's Google Photos.
 * Runs when MediaStore changes (content-URI trigger) and every 15 minutes as a fallback,
 * only when the network constraint (Wi-Fi only or any) is met.
 */
public class BackupWorker extends Worker {
    private static final String WORK_PERIODIC = "alldrive-backup-periodic";
    private static final String WORK_TRIGGER = "alldrive-backup-trigger";
    private static final String WORK_NOW = "alldrive-backup-now";
    private static final String INPUT_TRIGGER = "trigger";
    private static final String CHANNEL_ID = "backup";
    private static final int NOTIFICATION_ID = 4101;
    private static final String PHOTOS_API = "https://photoslibrary.googleapis.com/v1";

    /** ponytail: process-wide guard so overlapping triggers never upload the same file twice. */
    static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    /** One file failed for good (unsupported, deleted); skip it instead of blocking the queue. */
    private static final class SkipException extends Exception {
        SkipException(String message) { super(message); }
    }

    public BackupWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    // ---- scheduling ----

    private static Constraints.Builder baseConstraints(Context c) {
        boolean wifiOnly = BackupStore.prefs(c).getBoolean(BackupStore.KEY_WIFI_ONLY, true);
        return new Constraints.Builder()
            .setRequiredNetworkType(wifiOnly ? NetworkType.UNMETERED : NetworkType.CONNECTED)
            .setRequiresBatteryNotLow(true);
    }

    /** (Re)creates all backup work with the current settings. */
    static void schedule(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(BackupWorker.class, 15, TimeUnit.MINUTES)
            .setConstraints(baseConstraints(c).build())
            .build();
        wm.enqueueUniquePeriodicWork(WORK_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, periodic);
        scheduleTrigger(c, ExistingWorkPolicy.REPLACE);
    }

    /** Content triggers fire once, so the worker re-arms this after every triggered run. */
    private static void scheduleTrigger(Context c, ExistingWorkPolicy policy) {
        Constraints constraints = baseConstraints(c)
            .addContentUriTrigger(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true)
            .addContentUriTrigger(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, true)
            .setTriggerContentUpdateDelay(10, TimeUnit.SECONDS) // let bursts of photos settle
            .setTriggerContentMaxDelay(2, TimeUnit.MINUTES)
            .build();
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(BackupWorker.class)
            .setConstraints(constraints)
            .setInputData(new Data.Builder().putBoolean(INPUT_TRIGGER, true).build())
            .build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_TRIGGER, policy, req);
    }

    static void runNow(Context c) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(BackupWorker.class)
            .setConstraints(baseConstraints(c).build())
            .build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.KEEP, req);
    }

    static void cancel(Context c) {
        WorkManager wm = WorkManager.getInstance(c);
        wm.cancelUniqueWork(WORK_PERIODIC);
        wm.cancelUniqueWork(WORK_TRIGGER);
        wm.cancelUniqueWork(WORK_NOW);
    }

    static boolean hasMediaPermission(Context c) {
        if (Build.VERSION.SDK_INT >= 33) {
            return granted(c, Manifest.permission.READ_MEDIA_IMAGES) && granted(c, Manifest.permission.READ_MEDIA_VIDEO);
        }
        return granted(c, Manifest.permission.READ_EXTERNAL_STORAGE);
    }

    static boolean granted(Context c, String permission) {
        return ContextCompat.checkSelfPermission(c, permission) == PackageManager.PERMISSION_GRANTED;
    }

    // ---- the run ----

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        boolean triggered = getInputData().getBoolean(INPUT_TRIGGER, false);
        if (!RUNNING.compareAndSet(false, true)) return Result.success();
        try {
            return backup(c);
        } finally {
            RUNNING.set(false);
            if (triggered && BackupStore.prefs(c).getBoolean(BackupStore.KEY_ENABLED, false)) {
                scheduleTrigger(c, ExistingWorkPolicy.APPEND_OR_REPLACE);
            }
        }
    }

    private Result backup(Context c) {
        SharedPreferences prefs = BackupStore.prefs(c);
        if (!prefs.getBoolean(BackupStore.KEY_ENABLED, false) || prefs.getBoolean(BackupStore.KEY_NEEDS_RECONNECT, false)) {
            return Result.success();
        }
        if (!hasMediaPermission(c)) {
            prefs.edit().putString(BackupStore.KEY_LAST_ERROR, "Allow AllDrive to access all photos and videos to back them up.").apply();
            return Result.success();
        }
        String email = prefs.getString(BackupStore.KEY_EMAIL, "");
        long sinceDate = prefs.getLong(BackupStore.KEY_SINCE_DATE, Long.MAX_VALUE);
        long sinceId = prefs.getLong(BackupStore.KEY_SINCE_ID, Long.MAX_VALUE);
        String skipped = "";
        int done = 0;

        try (Cursor cur = queryAfter(c.getContentResolver(), sinceDate, sinceId)) {
            if (cur == null) return Result.retry();
            int total = cur.getCount();
            int idCol = cur.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int dateCol = cur.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_ADDED);
            int typeCol = cur.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE);
            int mimeCol = cur.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
            int nameCol = cur.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
            int sizeCol = cur.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
            int pendingCol = Build.VERSION.SDK_INT >= 29 ? cur.getColumnIndex(MediaStore.MediaColumns.IS_PENDING) : -1;

            while (cur.moveToNext()) {
                if (isStopped()) return Result.success(); // progress so far is saved; next run continues
                // Still being written (e.g. a video recording): stop here so nothing after it is skipped
                if (pendingCol >= 0 && cur.getInt(pendingCol) == 1) break;
                long id = cur.getLong(idCol);
                long date = cur.getLong(dateCol);
                if (!BackupStore.isUploaded(c, id, email)) {
                    showProgress(c, done + 1, total);
                    boolean video = cur.getInt(typeCol) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO;
                    String mime = cur.getString(mimeCol);
                    String name = cur.getString(nameCol);
                    try {
                        upload(c, email, mediaUri(c, id, video), mime != null ? mime : "application/octet-stream",
                            name != null ? name : "photo", cur.getLong(sizeCol));
                        BackupStore.markUploaded(c, id, email);
                        prefs.edit().putInt(BackupStore.KEY_UPLOADED, prefs.getInt(BackupStore.KEY_UPLOADED, 0) + 1).apply();
                    } catch (SkipException e) {
                        skipped = "Skipped " + name + ": " + e.getMessage();
                    }
                }
                done++;
                prefs.edit().putLong(BackupStore.KEY_SINCE_DATE, date).putLong(BackupStore.KEY_SINCE_ID, id).apply();
            }
        } catch (BackupStore.ReauthException e) {
            prefs.edit().putBoolean(BackupStore.KEY_NEEDS_RECONNECT, true).putString(BackupStore.KEY_LAST_ERROR, e.getMessage()).apply();
            return Result.success();
        } catch (IOException | SecurityException e) {
            prefs.edit().putString(BackupStore.KEY_LAST_ERROR, "Backup paused: " + e.getMessage() + ". Will retry.")
                .putLong(BackupStore.KEY_LAST_RUN, System.currentTimeMillis()).apply();
            return Result.retry();
        }
        prefs.edit().putString(BackupStore.KEY_LAST_ERROR, skipped).putLong(BackupStore.KEY_LAST_RUN, System.currentTimeMillis()).apply();
        return Result.success();
    }

    /** Photos and videos added after the watermark, oldest first, including ones still being written. */
    private static Cursor queryAfter(ContentResolver resolver, long sinceDate, long sinceId) {
        Uri files = MediaStore.Files.getContentUri("external");
        String[] projection = Build.VERSION.SDK_INT >= 29
            ? new String[] { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_ADDED, MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE, MediaStore.MediaColumns.IS_PENDING }
            : new String[] { MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_ADDED, MediaStore.Files.FileColumns.MEDIA_TYPE,
                MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.DISPLAY_NAME, MediaStore.MediaColumns.SIZE };
        String selection = "(" + MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE
            + " OR " + MediaStore.Files.FileColumns.MEDIA_TYPE + "=" + MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO + ")"
            + " AND (" + MediaStore.MediaColumns.DATE_ADDED + ">? OR (" + MediaStore.MediaColumns.DATE_ADDED + "=? AND "
            + MediaStore.MediaColumns._ID + ">?))";
        String[] args = { String.valueOf(sinceDate), String.valueOf(sinceDate), String.valueOf(sinceId) };
        String order = MediaStore.MediaColumns.DATE_ADDED + " ASC, " + MediaStore.MediaColumns._ID + " ASC";
        if (Build.VERSION.SDK_INT >= 30) {
            Bundle q = new Bundle();
            q.putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection);
            q.putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args);
            q.putString(ContentResolver.QUERY_ARG_SQL_SORT_ORDER, order);
            q.putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_INCLUDE);
            return resolver.query(files, projection, q, null);
        }
        if (Build.VERSION.SDK_INT == 29) files = MediaStore.setIncludePending(files);
        return resolver.query(files, projection, selection, args, order);
    }

    private static Uri mediaUri(Context c, long id, boolean video) {
        Uri uri = ContentUris.withAppendedId(
            video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id);
        // Without this Android strips GPS from photo EXIF before we read it
        if (Build.VERSION.SDK_INT >= 29 && granted(c, Manifest.permission.ACCESS_MEDIA_LOCATION)) {
            uri = MediaStore.setRequireOriginal(uri);
        }
        return uri;
    }

    /** Raw upload + mediaItems:batchCreate, the same flow as uploadToPhotos in client/src/api/localDrive.ts. */
    private static void upload(Context c, String email, Uri uri, String mime, String name, long size)
            throws IOException, BackupStore.ReauthException, SkipException {
        String token = BackupStore.accessToken(c, email, false)[0];
        String uploadToken;
        try {
            uploadToken = sendFile(c, token, uri, mime, size);
        } catch (UnauthorizedException e) {
            token = BackupStore.accessToken(c, email, true)[0];
            try {
                uploadToken = sendFile(c, token, uri, mime, size);
            } catch (UnauthorizedException again) {
                throw new BackupStore.ReauthException("Google rejected the sign-in. Reconnect " + email + ".");
            }
        }

        HttpURLConnection conn = open(PHOTOS_API + "/mediaItems:batchCreate", token);
        try {
            conn.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("newMediaItems", new JSONArray().put(new JSONObject()
                .put("simpleMediaItem", new JSONObject().put("uploadToken", uploadToken).put("fileName", name))))
                .toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream out = conn.getOutputStream()) { out.write(body); }
            int code = conn.getResponseCode();
            checkStatus(code, conn);
            JSONObject status = new JSONObject(BackupStore.readAll(conn.getInputStream()))
                .getJSONArray("newMediaItemResults").getJSONObject(0).optJSONObject("status");
            if (status != null && status.optInt("code", 0) != 0) {
                throw new SkipException(status.optString("message", "Google Photos rejected the file"));
            }
        } catch (JSONException e) {
            throw new IOException("Unexpected Google Photos response", e);
        } catch (UnauthorizedException e) {
            throw new IOException("Sign-in expired mid-upload");
        } finally {
            conn.disconnect();
        }
    }

    private static final class UnauthorizedException extends Exception {}

    private static String sendFile(Context c, String token, Uri uri, String mime, long size)
            throws IOException, UnauthorizedException, BackupStore.ReauthException, SkipException {
        HttpURLConnection conn = open(PHOTOS_API + "/uploads", token);
        try {
            conn.setRequestProperty("Content-Type", "application/octet-stream");
            conn.setRequestProperty("X-Goog-Upload-Content-Type", mime);
            conn.setRequestProperty("X-Goog-Upload-Protocol", "raw");
            if (size > 0) conn.setFixedLengthStreamingMode(size);
            else conn.setChunkedStreamingMode(64 * 1024);
            try (InputStream in = c.getContentResolver().openInputStream(uri); OutputStream out = conn.getOutputStream()) {
                if (in == null) throw new SkipException("file is no longer available");
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            } catch (FileNotFoundException e) {
                throw new SkipException("file was deleted");
            }
            checkStatus(conn.getResponseCode(), conn);
            return BackupStore.readAll(conn.getInputStream());
        } finally {
            conn.disconnect();
        }
    }

    private static HttpURLConnection open(String url, String token) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setConnectTimeout(30_000);
        conn.setReadTimeout(120_000);
        conn.setRequestProperty("Authorization", "Bearer " + token);
        return conn;
    }

    /** 401 → refresh and retry, 403 → missing Photos permission (stop), other 4xx → skip the file, 5xx/429 → retry later. */
    private static void checkStatus(int code, HttpURLConnection conn)
            throws IOException, UnauthorizedException, BackupStore.ReauthException, SkipException {
        if (code >= 200 && code < 300) return;
        String detail = BackupStore.readAll(conn.getErrorStream());
        if (code == 401) throw new UnauthorizedException();
        if (code == 403) {
            if (detail.contains("not been used") || detail.contains("disabled")) {
                throw new IOException("the Google Photos Library API is not enabled for this app");
            }
            throw new BackupStore.ReauthException("Google Photos permission is missing. Reconnect the account and tick the Google Photos permission.");
        }
        if (code == 429 || code >= 500) throw new IOException("Google is busy (HTTP " + code + ")");
        throw new SkipException("Google Photos rejected it (HTTP " + code + ")");
    }

    // ---- notification ----

    private void showProgress(Context c, int current, int total) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Photo backup", NotificationManager.IMPORTANCE_LOW));
        }
        Notification n = new NotificationCompat.Builder(c, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Backing up photos")
            .setContentText(current + " of " + total)
            .setProgress(total, current, false)
            .setOngoing(true)
            .setSilent(true)
            .build();
        ForegroundInfo info = Build.VERSION.SDK_INT >= 29
            ? new ForegroundInfo(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            : new ForegroundInfo(NOTIFICATION_ID, n);
        try {
            // Keeps long uploads alive; Android 12+ may refuse when the app is in the background
            setForegroundAsync(info).get();
        } catch (Exception ignored) {
            // Not fatal: the run continues as ordinary background work
        }
    }
}
