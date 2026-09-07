// Capacitor configuration for the Odysseus Android app.
//
// Architecture: thin native shell around the REMOTE upstream UI.
// `webDir: 'launcher'` bundles only the local server picker (launcher/).
// On launch it navigates the WebView top-level to the user's server URL,
// so page and API share ONE origin (the server's):
//   - No CORS: same-origin /api/* needs no preflights or allow-lists.
//   - No CSP friction: the server's own policy + nonces apply to its own
//     HTML unchanged. No backend changes required, ever.
//   - No version skew: HTML always loads fresh from the server; heavy assets
//     (JS/CSS/fonts/libs) are cached on-device by upstream's own sw.js,
//     which versions cache keys itself (CACHE_NAME / ?v= params).
// Native plugins below are all declarative (config-only, no JS bridge):
// after navigation to the remote origin the local JS context is gone, so
// everything native must work without bundled script assistance.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.odysseus.app',
  appName: 'Odysseus',
  webDir: 'launcher',
  backgroundColor: '#282c34',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    // No `url` by design: the destination server is chosen at runtime in
    // the launcher, not at build time.
    cleartext: true, // allow http:// LAN servers (e.g. http://192.168.1.x:7000)
    // The launcher navigates top-level to the user-entered server URL.
    // Capacitor opens every non-allow-listed host in the SYSTEM browser, so
    // without this the app would kick out to Chrome on connect. The host is
    // unknown at build time (each user self-hosts somewhere else, often a
    // bare LAN IP:port), hence the wildcard. Scoped risk: the app is a
    // dedicated client for the user's own server — it never links anywhere
    // else — but note Play review can question broad navigation rights.
    allowNavigation: ['*'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#282c34',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#282c34',
      overlaysWebView: false,
    },
    Keyboard: {
      // Pairs with the `interactive-widget=resizes-content` viewport upstream.
      resize: 'ionic',
    },
  },
};

export default config;
