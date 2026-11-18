package com.paperbetween.reader;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ready = false;
    private String pendingText = null;
    private float pendingRate = 1f;
    private PluginCall pendingCall = null;
    private final Map<String, PluginCall> calls = new HashMap<>();
    private int sequence = 0;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
        if (tts != null) {
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    // 开始朗读一个段落
                }

                @Override
                public void onDone(String utteranceId) {
                    PluginCall call = calls.remove(utteranceId);
                    if (call != null) call.resolve();
                }

                @Override
                public void onError(String utteranceId) {
                    PluginCall call = calls.remove(utteranceId);
                    if (call != null) call.reject("朗读失败");
                }
            });
        }
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS && tts != null) {
            int result = tts.setLanguage(Locale.CHINA);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.getDefault());
            }
            ready = true;
            if (pendingText != null) {
                speakNow(pendingText, pendingRate, pendingCall);
                pendingText = null;
                pendingCall = null;
            }
        }
    }

    private void speakNow(String text, float rate, PluginCall call) {
        if (tts == null) {
            if (call != null) call.reject("朗读引擎未就绪");
            return;
        }
        tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
        String id = "paper-" + (++sequence);
        if (call != null) {
            calls.put(id, call);
            try { call.setKeepAlive(true); } catch (Exception ignored) { }
        }
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, id);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        float rate = call.getFloat("rate", 1f);
        if (text.trim().isEmpty()) {
            call.reject("没有可朗读的文字");
            return;
        }
        if (ready) {
            call.setKeepAlive(true);
            speakNow(text, rate, call);
        } else {
            pendingText = text;
            pendingRate = rate;
            pendingCall = call;
            call.setKeepAlive(true);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        pendingText = null;
        if (pendingCall != null) { pendingCall.resolve(); pendingCall = null; }
        for (PluginCall item : calls.values()) item.resolve();
        calls.clear();
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", ready);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
