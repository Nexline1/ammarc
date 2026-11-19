"""Run after `flutter create .`: give the generated Android/iOS/web projects what Ammarc needs.
Each section runs only if that platform was generated (Render builds web only).
ponytail: the platform folders are generated in CI rather than committed; commit them once someone builds locally."""
import json
import pathlib
import plistlib
import re

root = pathlib.Path(__file__).resolve().parent.parent

man = root / 'android/app/src/main/AndroidManifest.xml'
if man.exists():
    s = man.read_text()
    perms = ''.join(f'    <uses-permission android:name="android.permission.{p}"/>\n' for p in ('INTERNET', 'RECORD_AUDIO'))
    if 'RECORD_AUDIO' not in s:
        s = s.replace('<application', perms + '    <application', 1)
    s = re.sub(r'android:label="[^"]*"', 'android:label="Ammarc"', s, count=1)
    man.write_text(s)
    # Debug builds may talk to a plain-http demo server (the emulator reaches this PC at 10.0.2.2).
    dbg = root / 'android/app/src/debug/AndroidManifest.xml'
    d = dbg.read_text()
    if 'usesCleartextTraffic' not in d:
        d = d.replace('</manifest>', '    <application android:usesCleartextTraffic="true"/>\n</manifest>')
    dbg.write_text(d)
    print('android patched')

plist = root / 'ios/Runner/Info.plist'
if plist.exists():
    p = plistlib.loads(plist.read_bytes())
    p.update({
        'CFBundleDisplayName': 'Ammarc',
        'NSCameraUsageDescription': 'Take a photo of the spot you want to change.',
        'NSPhotoLibraryUsageDescription': 'Choose a photo of the spot you want to change.',
        'NSMicrophoneUsageDescription': 'Say your idea instead of typing it.',
    })
    plist.write_bytes(plistlib.dumps(p))
    print('ios patched')

# Web (the iPhone home-screen app): name it, and make Safari treat it as a full-screen app.
wm = root / 'web/manifest.json'
if wm.exists():
    m = json.loads(wm.read_text())
    m.update({'name': 'Ammarc', 'short_name': 'Ammarc', 'description': 'Say it. See it built.',
              'background_color': '#F3F4F6', 'theme_color': '#F3F4F6', 'start_url': '.', 'display': 'standalone'})
    wm.write_text(json.dumps(m, indent=2))
    idx = root / 'web/index.html'
    h = idx.read_text()
    h = re.sub(r'<title>.*?</title>', '<title>Ammarc</title>', h, flags=re.S)
    h = re.sub(r'<meta name="apple-mobile-web-app-title" content="[^"]*">', '<meta name="apple-mobile-web-app-title" content="Ammarc">', h)
    if 'viewport' not in h:
        h = h.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">', 1)
    idx.write_text(h)
    print('web patched')
