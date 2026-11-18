package com.paperbetween.reader;

import android.os.Bundle;
import android.view.KeyEvent;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(DavHttpPlugin.class);
        registerPlugin(TtsPlugin.class);
        registerPlugin(PaperKeysPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (PaperKeysPlugin.volumePaging && (event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP || event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
                int direction = event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_DOWN ? 1 : -1;
                String script = "window.dispatchEvent(new CustomEvent('paper:volume',{detail:{direction:" + direction + "}}))";
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(script, null));
                }
            }
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
