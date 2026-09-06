#!/usr/bin/env bash
# mobile/build-android.sh — build a debug APK of the launcher shell.
# The app UI loads from the user's server at runtime; nothing upstream to sync.
# Usage:
#   ./mobile/build-android.sh            # cap sync + assembleDebug
#   ./mobile/build-android.sh --open     # also `cap open android`
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Install Node 20+ first." >&2
  exit 1
fi
echo "==> check launcher"
npm run check:launcher
if [ ! -d node_modules ]; then
  echo "==> npm install"
  npm install
fi
if [ ! -d android ]; then
  echo "==> npx cap add android (first time)"
  npx cap add android
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
