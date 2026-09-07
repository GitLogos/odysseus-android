# odysseus-android — Odysseus Android app (Capacitor, thin shell)

A tiny native wrapper around the self-hosted Odysseus web UI. The APK bundles
only a **server picker** (`launcher/`); on launch the WebView navigates
top-level to the user's server, so the full app loads straight from there —
always the exact version matching the backend.

```
odysseus-android/
├── capacitor.config.ts   # webDir: launcher, allowNavigation '*', declarative Splash/StatusBar/Keyboard
├── launcher/             # the ONLY bundled UI: server picker + auto-reconnect
│   ├── index.html
│   └── launcher.js       # zero dependencies, CORS-aware reachability probe
├── mobile/build-android.sh
└── .github/workflows/    # android-debug (manual+weekly), release (manual)
```

## Why this shape (the middle ground)

- **No version skew, ever.** HTML comes fresh from the server each launch, so
  upstream UI changes can never break the app. Nothing is forked or vendored.
- **No CORS.** Page and API share one origin (the server's), so no preflights,
  no allow-lists.
- **No CSP friction.** The server's own policy and nonces apply to its own
  HTML unchanged.
- **No backend changes required.** Stock `odysseus-dev/odysseus` works as-is —
  no CORS/CSP patches, no minimum server version.
- **Fast repeat loads.** Heavy, rarely-changing assets (JS modules, `lib/*`,
  fonts, CSS) are cached on-device by upstream's own `sw.js`, which versions
  its cache keys itself (`CACHE_NAME` / `?v=` params). First load after a
  server update fetches what changed; everything after is local.

One requirement lives on the **launcher → server hop**: the reachability probe
runs cross-origin from the launcher, so it first tries a readable CORS fetch
of `/api/auth/status` (shows the signed-in user when headers allow), then
falls back to an opaque `no-cors` probe (reachability without needing any
server headers). Either success means "safe to connect" — auth itself happens
on the server page, same-origin.

## Caching note: HTTPS vs LAN HTTP

Service Workers only install on secure contexts. Over `https://` you get the
full SW asset cache; over plain `http://` LAN IPs the app works identically
but caching falls back to the browser HTTP cache (upstream marks JS/CSS/HTML
`no-cache`, so they revalidate each load — cheap `304`s, still a round-trip).
For the best mobile experience, serve remotely over HTTPS (reverse proxy,
Tailscale, …).

## Quick start

```bash
npm install
npm run mobile:android   # cap sync + Android Studio; Run on device/emulator
# or: ./mobile/build-android.sh [--open]
```

First launch: enter the server URL (`http://192.168.1.20:7000` on LAN,
`https://ai.example.com` remote), `Test`, then `Save & connect`. Returning
launches auto-reconnect with a cancel window (`Change` re-opens the picker).
To force the picker (saved host moved): clear the app's storage, or open the
launcher with `#setup`.

## CI (GitHub Actions — all manually triggerable)

| Workflow | Trigger | Does |
|---|---|---|
| `android-debug` | manual, push on `launcher/`+config, weekly | launcher check + `cap sync` + `assembleDebug`, uploads APK artifact |
| `android-release` | manual only (`version_name` input) | `bundleRelease`/`assembleRelease`, **publishes AAB+APK to GitHub Releases** (`v<version>` tag, or `build-<run>` without input) |

Release signing needs repo secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`;
without them the workflow still succeeds but publishes unsigned artifacts
marked as prerelease (testing only, not for the Play Store).

## LAN / cleartext notes

- `cleartext: true` permits `http://` LAN servers; verify
  `android:usesCleartextTraffic="true"` in the generated manifest.
- Cookies and login work unchanged (same-origin, no third-party context).
- Deliberately no JS bridge into the remote page: after navigation the local
  context is gone, so all native behavior (splash, status bar, keyboard
  resize) is config-declared in `capacitor.config.ts`.
