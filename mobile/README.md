# Ammarc for phones (Flutter)

A native shell around the live Ammarc site. Everything Ammar does on the web works here, and every web update reaches the app without a store release. The app adds what a browser tab does badly:

- **Photos:** "Upload a photo" offers *Take a photo* or *Choose from photos*.
- **Voice:** asks for the microphone once, then the mic button works (needs the site on https).
- **Exports:** PNG, slide and deck downloads open the share sheet (WhatsApp, email, Files).
- **Mail links** open the mail app; **Back** closes the open sheet before leaving.
- PDF printing is hidden in the app (WebViews have no print dialog); the deck and PNG cover it.

## Build

CI builds it (`.github/workflows/mobile.yml`): analyze, tests, a debug APK, and an emulator smoke test against the demo server. To build by hand with Flutter installed:

```bash
cd mobile
flutter create --org com.nexline --project-name ammarc --platforms android,ios .
python3 tool/platforms.py
dart run flutter_launcher_icons
flutter build apk --release --dart-define=AMMARC_URL=https://YOUR-RENDER-URL
```

Without `AMMARC_URL` the app asks for the address once and remembers it. iPhone builds need a Mac with Xcode (`flutter build ipa`); add `PERMISSION_MICROPHONE=1` to the Podfile's `GCC_PREPROCESSOR_DEFINITIONS` for permission_handler.
