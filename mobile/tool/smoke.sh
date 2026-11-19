#!/usr/bin/env bash
# Install the debug APK on the emulator, open it, and check the real Ammarc page rendered inside it.
set -u
mkdir -p smoke
adb install -r "$1"
adb shell pm grant com.nexline.ammarc android.permission.RECORD_AUDIO || true
adb shell am start -n com.nexline.ammarc/.MainActivity
ok=0
for i in $(seq 30); do
  sleep 4
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml smoke/ui.xml >/dev/null 2>&1
  if grep -q "Drop a photo of the spot" smoke/ui.xml 2>/dev/null; then ok=1; break; fi
done
adb exec-out screencap -p > smoke/home.png
adb logcat -d | grep -iE "flutter|chromium|ammarc" | tail -200 > smoke/logcat.txt
if [ $ok = 1 ]; then echo "PASS: Ammarc's start screen rendered inside the app"; else echo "FAIL: start screen never appeared"; exit 1; fi
