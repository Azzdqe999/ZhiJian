package com.paperbetween.reader;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PaperKeys")
public class PaperKeysPlugin extends Plugin {
    public static volatile boolean volumePaging = false;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        volumePaging = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }
}
