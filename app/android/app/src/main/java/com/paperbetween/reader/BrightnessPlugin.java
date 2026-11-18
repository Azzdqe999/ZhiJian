package com.paperbetween.reader;

import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PaperBrightness")
public class BrightnessPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        float value = call.getFloat("value", 0.8f);
        final float level = Math.max(0.05f, Math.min(1f, value));
        if (getActivity() == null) {
            call.reject("没有可用的窗口");
            return;
        }
        getActivity().runOnUiThread(() -> {
            WindowManager.LayoutParams params = getActivity().getWindow().getAttributes();
            params.screenBrightness = level;
            getActivity().getWindow().setAttributes(params);
            call.resolve();
        });
    }
}
