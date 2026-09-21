#!/usr/bin/env python3
"""Patch project Android hasil `npx cap add android`:
   - AdMob App ID (AndroidManifest + strings.xml)
   - orientasi landscape
   - MainActivity fullscreen (immersive)
Dijalankan dari root repo oleh GitHub Actions."""
import json
import os
import re
import sys

cfg = json.load(open('capacitor.config.json', encoding='utf-8'))
app_id = cfg['appId']
admob_app_id = os.environ.get('ADMOB_APP_ID') or 'ca-app-pub-3940256099942544~3347511713'
base = 'android/app/src/main'

if not re.fullmatch(r'ca-app-pub-\d+~\d+', admob_app_id):
    sys.exit('ADMOB_APP_ID tidak valid (format: ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY): ' + admob_app_id)

# ---- 1. AndroidManifest.xml ----
p = base + '/AndroidManifest.xml'
s = open(p, encoding='utf-8').read()
if 'com.google.android.gms.ads.APPLICATION_ID' not in s:
    meta = ('    <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" '
            'android:value="@string/admob_app_id" />\n    ')
    if '</application>' not in s:
        sys.exit('AndroidManifest.xml: tag </application> tidak ketemu')
    s = s.replace('</application>', meta + '</application>', 1)
if 'android:screenOrientation' not in s:
    if not re.search(r'<activity\b', s):
        sys.exit('AndroidManifest.xml: tag <activity> tidak ketemu')
    s = re.sub(r'<activity\b', '<activity android:screenOrientation="sensorLandscape"', s, count=1)
open(p, 'w', encoding='utf-8').write(s)

# ---- 2. strings.xml ----
p = base + '/res/values/strings.xml'
s = open(p, encoding='utf-8').read()
s = re.sub(r'[ \t]*<string name="admob_app_id">.*?</string>\n?', '', s)
s = s.replace('</resources>', '    <string name="admob_app_id">%s</string>\n</resources>' % admob_app_id, 1)
open(p, 'w', encoding='utf-8').write(s)

# ---- 3. MainActivity.java ----
pkg_dir = base + '/java/' + app_id.replace('.', '/')
os.makedirs(pkg_dir, exist_ok=True)
kt = pkg_dir + '/MainActivity.kt'
if os.path.exists(kt):
    os.remove(kt)
tpl = open('scripts/MainActivity.java.tpl', encoding='utf-8').read()
open(pkg_dir + '/MainActivity.java', 'w', encoding='utf-8').write(tpl.replace('__APP_ID__', app_id))

print('OK: appId=%s, admob_app_id=%s' % (app_id, admob_app_id))
