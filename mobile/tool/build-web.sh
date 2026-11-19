#!/usr/bin/env bash
# Build the native app for the web into dist/m (served at /m). Used by Render after the website build.
# Never fails the deploy: without Flutter the website still ships, just without /m.
set -u
cd "$(dirname "$0")/.."
FLUTTER="${FLUTTER:-flutter}"
if ! command -v "$FLUTTER" >/dev/null 2>&1; then
  [ -x "$HOME/flutter/bin/flutter" ] || git clone -q --depth 1 -b stable https://github.com/flutter/flutter.git "$HOME/flutter" || { echo "build-web: no Flutter, skipping /m"; exit 0; }
  FLUTTER="$HOME/flutter/bin/flutter"
fi
{
  "$FLUTTER" config --no-analytics >/dev/null 2>&1
  [ -d web ] || "$FLUTTER" create --org com.nexline --project-name ammarc --platforms web . >/dev/null
  rm -f test/widget_test.dart
  python3 tool/platforms.py 2>/dev/null || true
  "$FLUTTER" pub get >/dev/null
  dart run flutter_launcher_icons >/dev/null 2>&1 || "$FLUTTER" pub run flutter_launcher_icons >/dev/null 2>&1 || true
  "$FLUTTER" build web --release --base-href /m/ --pwa-strategy offline-first
} && rm -rf ../dist/m && cp -r build/web ../dist/m && echo "build-web: /m ready" || echo "build-web: Flutter build failed, skipping /m"
exit 0
