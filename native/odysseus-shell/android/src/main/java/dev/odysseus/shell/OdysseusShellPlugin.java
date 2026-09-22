package dev.odysseus.shell;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Process;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.view.WindowManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "OdysseusShell",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class OdysseusShellPlugin extends Plugin {
    private boolean manualKeepAwake;
    private boolean voiceActive;

    @Override
    public void load() {
        getBridge().getWebView().addJavascriptInterface(
            new VoiceHostBridge(),
            "OdysseusApp"
        );
    }

    @PluginMethod
    public void getMicrophoneStatus(PluginCall call) {
        if (!requireLocalLauncher(call)) {
            return;
        }
        call.resolve(microphoneStatus());
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (!requireLocalLauncher(call)) {
            return;
        }
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject result = microphoneStatus();
            result.put("restartRequired", false);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (call == null) {
            return;
        }
        JSObject result = microphoneStatus();
        result.put("restartRequired", Boolean.TRUE.equals(result.getBool("granted")));
        call.resolve(result);
    }

    @PluginMethod
    public void clearWebData(PluginCall call) {
        if (!requireLocalLauncher(call)) {
            return;
        }
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            webView.clearCache(true);
            CookieManager cookies = CookieManager.getInstance();
            cookies.removeAllCookies(removed -> {
                cookies.flush();
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        if (!requireLocalLauncher(call)) {
            return;
        }
        manualKeepAwake = call.getBoolean("enabled", false);
        updateKeepAwake();
        call.resolve();
    }

    @PluginMethod
    public void restartApp(PluginCall call) {
        if (!requireLocalLauncher(call)) {
            return;
        }
        Activity activity = getActivity();
        Intent launch = activity.getPackageManager()
            .getLaunchIntentForPackage(activity.getPackageName());
        if (launch == null) {
            call.reject("Unable to resolve the application launch intent");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        call.resolve();
        activity.startActivity(launch);
        activity.finish();
        Process.killProcess(Process.myPid());
    }

    @Override
    protected void handleOnPause() {
        voiceActive = false;
        updateKeepAwake();
    }

    private JSObject microphoneStatus() {
        Activity activity = getActivity();
        boolean granted = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        boolean rationale = !granted && ActivityCompat.shouldShowRequestPermissionRationale(
            activity,
            Manifest.permission.RECORD_AUDIO
        );
        String state;
        if (granted) {
            state = "granted";
        } else if (rationale) {
            state = "prompt-with-rationale";
        } else if (getPermissionState("microphone") == PermissionState.DENIED) {
            state = "denied";
        } else {
            state = "prompt";
        }
        JSObject result = new JSObject();
        result.put("state", state);
        result.put("granted", granted);
        return result;
    }

    private boolean requireLocalLauncher(PluginCall call) {
        String currentUrl = getBridge().getWebView().getUrl();
        Uri uri = currentUrl == null ? null : Uri.parse(currentUrl);
        boolean local = uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && "localhost".equalsIgnoreCase(uri.getHost());
        if (!local) {
            call.reject("This device control is only available from the local app settings");
        }
        return local;
    }

    private void setVoiceActive(boolean active) {
        voiceActive = active;
        updateKeepAwake();
    }

    private void updateKeepAwake() {
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            if (manualKeepAwake || voiceActive) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    private final class VoiceHostBridge {
        @JavascriptInterface
        public void setVoiceActive(boolean active) {
            OdysseusShellPlugin.this.setVoiceActive(active);
        }
    }
}
