// Capacitor configuration for the Odysseus Android app.
//
// IMPORTANT: `webDir` is NOT a checkout of the upstream repo. It is a staging
// directory assembled by `npm run sync:upstream` (scripts/sync-upstream.mjs),
// which pulls `static/` from odysseus-dev/odysseus at a pinned ref, applies
// the local `overlay/` (Capacitor shims + HTML patching), and lays it out to
// mirror the server's URL space:
//
//   www/index.html          <- upstream static/index.html (patched)
//   www/login.html          <- upstream static/login.html (patched, /login route)
//   www/login/index.html    <- same (directory-index fallback)
//   www/static/**           <- upstream static/** + overlay JS
//   www/.upstream.json      <- provenance stamp (repo/ref/sha/date)
//
// The mirror layout matters: index.html references absolute `/static/...`
// URLs, and Capacitor serves webDir as the document root, so `/static/x`
// must resolve to `www/static/x`. Bundling upstream `static/` directly as
// webDir would 404 every absolute asset URL.
//
// Only `/api/*` goes over the network (rewritten to the user-configured
// server by overlay/static/js/capacitor-boot.js). Everything else is local.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.odysseus.app',
  appName: 'Odysseus',
  webDir: 'www',
  backgroundColor: '#282c34',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    // No `url` by design: the UI loads from the local bundle, the API base
    // is chosen at runtime in the onboarding sheet, not at build time.
    cleartext: true, // allow http:// LAN servers (e.g. http://192.168.1.x:7000)
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
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
