#!/usr/bin/env bash
# mobile/build-android.sh — sync upstream web UI, then build a debug APK.
# Usage:
#   ./mobile/build-android.sh                 # sync + assembleDebug
#   ./mobile/build-android.sh --sync-only     # just rebuild www/
#   ./mobile/build-android.sh --open          # also `cap open android`
# Env: UPSTREAM_REPO / UPSTREAM_REF / UPSTREAM_LOCAL / STRICT (see sync script).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node 20+ first." >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "==> npm install"
  npm install
fi
echo "==> sync web UI from upstream (ref: ${UPSTREAM_REF:-$(cat upstream.ref)})"
npm run sync:upstream
if [ ! -d android ]; then
  echo "==> npx cap add android (first time)"
  npx cap add android
fi
if [[ "${1:-}" == "--sync-only" ]]; then
  echo "Sync done. www/ is staged; run 'npx cap sync android' when ready."
  exit 0
fi
echo "==> cap sync android"
npx cap sync android
echo "==> assembleDebug"
(
  cd android
  if [ -x ./gradlew ]; then ./gradlew assembleDebug; else gradle assembleDebug; fi
)
APK="$(find android/app/build/outputs/apk/debug -name '*.apk' 2>/dev/null | head -1 || true)"
if [ -n "$APK" ]; then
  echo "APK: $ROOT/$APK"
else
  echo "Build finished (APK lookup failed — check android/app/build/outputs/apk/debug/)."
fi
if [[ "${1:-}" == "--open" ]]; then
  npx cap open android || true
fi
