"""Run after `flutter create .`: give the generated Android/iOS projects what Ammarc needs.
ponytail: the platform folders are generated in CI rather than committed; commit them once someone builds locally."""
import pathlib, plistlib, re

root = pathlib.Path(__file__).resolve().parent.parent
man = root / 'android/app/src/main/AndroidManifest.xml'
s = man.read_text()
perms = ''.join(f'    <uses-permission android:name="android.permission.{p}"/>\n' for p in ('INTERNET', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS'))
if 'RECORD_AUDIO' not in s:
    s = s.replace('<application', perms + '    <application', 1)
s = re.sub(r'android:label="[^"]*"', 'android:label="Ammarc"', s, count=1)
links = ('        <intent><action android:name="android.intent.action.SENDTO"/><data android:scheme="mailto"/></intent>\n'
         '        <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="https"/></intent>\n')
if 'mailto' not in s:
    s = s.replace('<queries>', '<queries>\n' + links, 1) if '<queries>' in s else s.replace('</manifest>', f'    <queries>\n{links}    </queries>\n</manifest>')
man.write_text(s)

# Debug builds may talk to a plain-http demo server (the emulator reaches this PC at 10.0.2.2); release builds may not.
dbg = root / 'android/app/src/debug/AndroidManifest.xml'
d = dbg.read_text()
if 'usesCleartextTraffic' not in d:
    d = d.replace('</manifest>', '    <application android:usesCleartextTraffic="true"/>\n</manifest>')
dbg.write_text(d)

plist = root / 'ios/Runner/Info.plist'
p = plistlib.loads(plist.read_bytes())
p.update({
    'CFBundleDisplayName': 'Ammarc',
    'NSCameraUsageDescription': 'Take a photo of the spot you want to change.',
    'NSPhotoLibraryUsageDescription': 'Choose a photo of the spot you want to change.',
    'NSMicrophoneUsageDescription': 'Say your idea instead of typing it.',
})
plist.write_bytes(plistlib.dumps(p))
print('platforms patched')
