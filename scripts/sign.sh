#!/usr/bin/env bash
# Tanda tangani APK (untuk TapTap) dan AAB (untuk Play Store) hasil build release.
# Butuh env: KEYSTORE_BASE64, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD
set -euo pipefail

mkdir -p out
echo "$KEYSTORE_BASE64" | base64 -d > release.keystore

BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
echo "build-tools: $BT"

# --- APK ---
UNSIGNED_APK=$(ls android/app/build/outputs/apk/release/*.apk | head -1)
"$BT/zipalign" -f -p 4 "$UNSIGNED_APK" out/aligned.apk
"$BT/apksigner" sign \
  --ks release.keystore --ks-key-alias "$KEY_ALIAS" \
  --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD \
  --out out/BlockZone-release.apk out/aligned.apk
"$BT/apksigner" verify out/BlockZone-release.apk
rm -f out/aligned.apk out/*.idsig

# --- AAB ---
AAB=$(ls android/app/build/outputs/bundle/release/*.aab | head -1)
jarsigner -keystore release.keystore \
  -storepass:env KEYSTORE_PASSWORD -keypass:env KEY_PASSWORD \
  -sigalg SHA256withRSA -digestalg SHA-256 \
  -signedjar out/BlockZone-release.aab "$AAB" "$KEY_ALIAS"

rm -f release.keystore
ls -la out
