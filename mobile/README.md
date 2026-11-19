# Ammarc, native (Flutter)

The same Ammarc loop as the website, written natively: its own board, gestures and drawing, talking to the same server (`/api/*`). One codebase builds:

- **Android:** an APK (GitHub Actions → Releases, and the download at `/app`).
- **iPhone:** the web build, served by the Ammarc server at **`/m`**. In Safari: Share → **Add to Home Screen**. No App Store account needed.

## What's in it

Sign in · ideas · photo (camera/gallery) or blank board · pinch/pan, double-tap to fit · tools: move, mark, point, arrow, note, erase · elements library (search EN/AR, move, resize, rotate, flip) · type or say one sentence → Claude's plan → masked render with live preview and byte-identical paste-back (`lib/raster.dart`, ported from `src/canvas/raster.ts`) → new version → background check · chat with one-tap chips, fixes and rules · view chips (side, cutaway, exploded, 3D) · versions · before/after · undo/redo · share picture, pitch, supervisor email · English/Arabic (RTL).

Not yet (use the website): dimension/scale tool, My parts and cut-outs, PowerPoint deck, PDF.

## Build

```bash
cd mobile
flutter create --org com.nexline --project-name ammarc --platforms android,ios,web .
python3 tool/platforms.py
dart run flutter_launcher_icons
flutter test
flutter build apk --release                    # opens https://ammarc-d68t.onrender.com
flutter build web --release --base-href /m/    # copy build/web to ../dist/m
```

`--dart-define=AMMARC_URL=…` points the Android build at another server. Render runs `tool/build-web.sh` after the website build, so `/m` stays in step with every deploy.
