# odysseus-android — Odysseus Android app (Capacitor, split-repo build)

The Android project lives here. The web UI lives upstream in
[odysseus-dev/odysseus](https://github.com/odysseus-dev/odysseus) and is pulled
at build time — this repo never forks or vendors it.

```
odysseus-android/                  # THIS repo (native shell + tooling)
├── capacitor.config.ts            # webDir: www/ (staged, gitignored)
├── upstream.ref                   # pinned upstream ref (branch/tag/SHA)
├── overlay/static/js/             # Capacitor shims this repo owns
│   ├── capacitor-boot.js          # native detect, /api/* rewrite, cache, SW off
│   ├── capacitor-server.js        # server-URL store + connection probe
│   ├── capacitor-native.js        # StatusBar/Splash/Keyboard/Haptics/Share
│   └── capacitor-onboarding.js    # "connect to your server" sheet
├── scripts/sync-upstream.mjs      # fetch upstream -> stage www/ -> patch
├── mobile/build-android.sh        # sync + cap sync + gradle assembleDebug
└── www/                           # GENERATED (gitignored): staged app bundle
    ├── index.html                 # <- upstream static/index.html (patched)
    ├── login.html / login/        # <- upstream static/login.html (patched)
    ├── static/**                  # <- upstream static/** + overlay JS
    └── .upstream.json             # provenance stamp {repo, ref, sha, date}
```

## How the caching works

`www/` mirrors the server's URL space (`index.html` at root, assets under
`static/`), because upstream uses absolute `/static/...` URLs and Capacitor
serves `webDir` as the document root. The whole bundle ships inside the APK,
so the app shell, all JS modules, CSS, fonts, and vendored libs load from
disk (~0ms). Only `/api/*` hits the network, rewritten to the user-chosen
server by `capacitor-boot.js`. Hot startup endpoints (`/api/auth/settings`,
`/api/tools`) are additionally snapshotted to `localStorage` for instant
cold-start paint while the network revalidates. The service worker is disabled
in native — the bundle IS the cache.

## Quick start

```bash
npm install
npm run sync:upstream        # pull upstream @ upstream.ref, stage www/
npx cap add android          # first time only
npx cap sync android
npx cap open android         # Android Studio -> Run
# or: ./mobile/build-android.sh [--sync-only|--open]
```

First launch: onboarding asks for the server URL
(e.g. `http://192.168.1.20:7000` on LAN, `https://ai.example.com` remote),
probes `GET <url>/api/auth/status`, saves, reloads. Switch later via
`window.__odysseusShowServerSetup()` (wire to a Settings row).

## Pinning the upstream version

```bash
echo "v1.2.3" > upstream.ref        # a release tag (recommended for store builds)
echo "a1b2c3d..." > upstream.ref   # exact commit (most reproducible)
echo "dev" > upstream.ref           # bleeding edge (default)
node scripts/sync-upstream.mjs --ref main   # one-off override (flag > env > file)
UPSTREAM_LOCAL=/path/to/odysseus npm run sync:upstream  # dev loop, no network
```

Every sync records the resolved commit in `www/.upstream.json`, so any APK is
traceable to an exact upstream SHA. CI builds weekly + on demand
(`.github/workflows/android.yml`, `upstream_ref` input).

## Upstream requirement: server support (2 one-liners)

No upstream **web-file** changes are needed — overlay patching happens on the
staged copies. But the **server** must allow the Capacitor WebView origin, or
remote `/api/*` calls are CSP/CORS-blocked. Required upstream (one line each):

1. `core/middleware.py` — `connect-src` must include the app schemes:
   `"connect-src 'self' capacitor: ionic: http://localhost https://localhost http: https:; "`
2. `app.py` — default `ALLOWED_ORIGINS` must include
   `capacitor://localhost,ionic://localhost,https://localhost`
   (or set the `ALLOWED_ORIGINS` env on the server — no code change needed).

`sync-upstream.mjs` checks for both markers in the fetched tree: it warns by
default and fails with `--strict` / `STRICT=1` (CI-friendly). Until those merge
upstream, pin to a ref containing them or apply them as a local patch.

## LAN / cleartext notes

- `cleartext: true` in `capacitor.config.ts` permits `http://` LAN servers;
  verify `android:usesCleartextTraffic="true"` in the generated manifest.
- Cookies work in the WebView with `credentials: 'include'` (the boot patch
  forces this on rewritten requests); API-token auth works unchanged.

## CI (GitHub Actions — all manually triggerable)

| Workflow | Trigger | Does |
|---|---|---|
| `upstream-sync` | manual (`upstream_ref` input), push to `scripts/`/`overlay/`/`upstream.ref`, weekly | strict sync check, uploads staged `www/` |
| `android-debug` | manual (`upstream_ref` input), weekly | strict sync + `cap sync` + `assembleDebug`, uploads APK |
| `android-release` | manual only (`upstream_ref`, `version_name` inputs) | strict sync + `bundleRelease`/`assembleRelease`, uploads AAB+APK |

Run manually: repo page -> Actions -> pick workflow -> Run workflow.
Release signing needs repo secrets `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`;
without them the release workflow still succeeds but uploads unsigned
artifacts (testing only, not for the Play Store).
