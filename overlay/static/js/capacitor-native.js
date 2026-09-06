// static/js/capacitor-native.js
// Thin wrappers over Capacitor plugins with graceful web fallbacks.
// All imports are lazy + dynamic so plain browsers (no npm Capacitor
// packages installed) never pay for — or break on — native code.

function isNative() {
  return !!window.__odysseusCapacitorNative;
}

async function loadPlugin(packageName, exportName) {
  if (!isNative()) return null;
  try {
    var mod = await import(/* @vite-ignore */ packageName);
    return (mod && (mod[exportName] || mod.default)) || null;
  } catch (_) {
    return null;
  }
}

/** StatusBar styling + hide splash once the app shell has painted. */
export async function initNativeUi() {
  if (!isNative()) return;
  try {
    var StatusBar = await loadPlugin('@capacitor/status-bar', 'StatusBar');
    if (StatusBar && StatusBar.setStyle && StatusBar.setBackgroundColor) {
      try {
        await StatusBar.setStyle({ style: 'DARK' });
      } catch (_) {}
      try {
        var bg = '#282c34';
        try {
          var t = JSON.parse(window.localStorage.getItem('odysseus-theme') || 'null');
          if (t && t.colors && t.colors.bg) bg = t.colors.bg;
        } catch (_) {}
        await StatusBar.setBackgroundColor({ color: bg });
      } catch (_) {}
    }
  } catch (_) {}
  try {
    var Splash = await loadPlugin('@capacitor/splash-screen', 'SplashScreen');
    if (Splash && Splash.hide) await Splash.hide();
  } catch (_) {}
  try {
    // Keep the WebView from panning oddly when the keyboard opens; the
    // Keyboard plugin is configured with resize:'ionic' in capacitor.config.ts.
    var Keyboard = await loadPlugin('@capacitor/keyboard', 'Keyboard');
    if (Keyboard && Keyboard.setResizeMode) {
      try {
        await Keyboard.setResizeMode({ mode: 'ionic' });
      } catch (_) {}
    }
  } catch (_) {}
  // Mirror theme bg to the native status bar whenever the theme changes.
  try {
    window.addEventListener('odysseus:theme-applied', async function (e) {
      try {
        var StatusBar2 = await loadPlugin('@capacitor/status-bar', 'StatusBar');
        var color =
          (e && e.detail && e.detail.bg) ||
          (function () {
            try {
              var t2 = JSON.parse(window.localStorage.getItem('odysseus-theme') || 'null');
              return (t2 && t2.colors && t2.colors.bg) || '#282c34';
            } catch (_) {
              return '#282c34';
            }
          })();
        if (StatusBar2 && StatusBar2.setBackgroundColor) {
          await StatusBar2.setBackgroundColor({ color: color });
        }
      } catch (_) {}
    });
  } catch (_) {}
}

/** Light haptic tick; no-op on web (navigator.vibrate already covers it). */
export async function hapticTick(style) {
  if (!isNative()) {
    try {
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (_) {}
    return;
  }
  try {
    var Haptics = await loadPlugin('@capacitor/haptics', 'Haptics');
    if (Haptics && Haptics.impact) {
      await Haptics.impact({ style: style || 'LIGHT' });
      return;
    }
  } catch (_) {}
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch (_) {}
}

/** Share text via the native sheet, clipboard fallback on web. */
export async function shareText(title, text) {
  var payload = String(text || '');
  if (!isNative()) {
    try {
      if (navigator.share) {
        await navigator.share({ title: title || 'Odysseus', text: payload });
        return true;
      }
    } catch (_) {}
    try {
      await navigator.clipboard.writeText(payload);
      return true;
    } catch (_) {
      return false;
    }
  }
  try {
    var Share = await loadPlugin('@capacitor/share', 'Share');
    if (Share && Share.share) {
      await Share.share({ title: title || 'Odysseus', text: payload });
      return true;
    }
  } catch (_) {}
  try {
    await navigator.clipboard.writeText(payload);
    return true;
  } catch (_) {
    return false;
  }
}
