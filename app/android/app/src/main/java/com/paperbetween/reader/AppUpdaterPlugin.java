package com.paperbetween.reader;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private long downloadId = -1;
    private BroadcastReceiver receiver;

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            ret.put("versionCode", code);
            ret.put("versionName", info.versionName);
        } catch (Exception ignored) {
            ret.put("versionCode", 0);
            ret.put("versionName", "0");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("missing url");
            return;
        }
        File dir = new File(getContext().getExternalFilesDir(null), "updates");
        if (!dir.exists()) dir.mkdirs();
        File apk = new File(dir, "update.apk");
        if (apk.exists()) apk.delete();

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("纸间更新");
        request.setDescription("正在下载新版本…");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setDestinationInExternalFilesDir(getContext(), null, "updates/update.apk");
        request.setMimeType("application/vnd.android.package-archive");
        downloadId = manager.enqueue(request);
        registerReceiver();
        JSObject ret = new JSObject();
        ret.put("downloadId", downloadId);
        call.resolve(ret);
    }

    private void registerReceiver() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != downloadId) return;
                unregisterReceiver();
                installApk();
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            receiver,
            new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
            ContextCompat.RECEIVER_EXPORTED
        );
    }

    private void unregisterReceiver() {
        if (receiver == null) return;
        try {
            getContext().unregisterReceiver(receiver);
        } catch (Exception ignored) {
        }
        receiver = null;
    }

    private void installApk() {
        File apk = new File(getContext().getExternalFilesDir(null), "updates/update.apk");
        if (!apk.exists()) return;
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(settings);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    @Override
    protected void handleOnDestroy() {
        unregisterReceiver();
        super.handleOnDestroy();
    }
}
