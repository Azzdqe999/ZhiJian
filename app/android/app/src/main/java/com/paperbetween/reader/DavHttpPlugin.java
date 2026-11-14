package com.paperbetween.reader;

import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Iterator;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.Dns;
import okhttp3.Headers;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

@CapacitorPlugin(name = "DavHttp")
public class DavHttpPlugin extends Plugin {
    private final OkHttpClient client = new OkHttpClient.Builder()
        .dns(hostname -> {
            try {
                return Dns.SYSTEM.lookup(hostname);
            } catch (UnknownHostException error) {
                if ("dav.jianguoyun.com".equals(hostname)) {
                    return Arrays.asList(InetAddress.getByAddress(hostname, new byte[]{(byte) 172, (byte) 65, (byte) 209, (byte) 49}));
                }
                throw error;
            }
        })
        .build();

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET");
        String body = call.getString("body");
        JSObject headers = call.getObject("headers");
        if (url == null) {
            call.reject("missing url");
            return;
        }
        Request.Builder builder = new Request.Builder().url(url);
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                String value = headers.getString(key);
                if (value != null) builder.addHeader(key, value);
            }
        }
        RequestBody requestBody = body == null ? null : RequestBody.create(body, MediaType.parse("application/octet-stream"));
        builder.method(method, requestBody);
        client.newCall(builder.build()).enqueue(new Callback() {
            @Override
            public void onFailure(Call httpCall, IOException error) {
                call.reject(error.getMessage() == null ? "network error" : error.getMessage());
            }

            @Override
            public void onResponse(Call httpCall, Response response) {
                try {
                    JSObject result = new JSObject();
                    result.put("status", response.code());
                    JSObject responseHeaders = new JSObject();
                    Headers source = response.headers();
                    for (String name : source.names()) {
                        responseHeaders.put(name, source.get(name));
                    }
                    result.put("headers", responseHeaders);
                    byte[] bytes = response.body() == null ? new byte[0] : response.body().bytes();
                    result.put("body", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    call.resolve(result);
                    response.close();
                } catch (Exception error) {
                    call.reject(error.getMessage());
                }
            }
        });
    }
}
