package com.paperbetween.reader;

import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "Tts")
public class TtsPlugin extends Plugin implements TextToSpeech.OnInitListener {
    private TextToSpeech tts;
    private boolean ready = false;
    private String pendingText = null;
    private float pendingRate = 1f;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
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
                speakNow(pendingText, pendingRate);
                pendingText = null;
            }
        }
    }

    private void speakNow(String text, float rate) {
        if (tts == null) return;
        tts.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
        tts.speak(text, TextToSpeech.QUEUE_ADD, null, "paper-" + System.nanoTime());
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
            speakNow(text, rate);
        } else {
            pendingText = text;
            pendingRate = rate;
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        pendingText = null;
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
