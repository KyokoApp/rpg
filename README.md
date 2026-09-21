# BlockZone (Android)

Game `BlockZone` dibungkus jadi aplikasi Android pakai Capacitor. Build-nya jalan di GitHub Actions, jadi gak butuh laptop.

## Cara pakai

1. Push semua file ini ke repo GitHub (**private**).
2. Tab **Actions** → workflow **Build Android** jalan otomatis tiap push. Kalau sudah hijau, download artifact `BlockZone-debug-apk` buat tes install di HP.

## Rilis ke Play Store / TapTap

1. Actions → **Generate Keystore** → Run workflow. Download artifact `keystore-SIMPAN-JANGAN-HILANG`.
2. Repo → Settings → Secrets and variables → Actions → **Secrets**, tambah 4 secret:
   - `KEYSTORE_BASE64` = isi file `KEYSTORE_BASE64.txt`
   - `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` = dari file `SECRETS.txt`
3. Simpan file keystore di tempat aman (kalau hilang, app gak bisa di-update dengan kunci yang sama), lalu hapus artifact-nya dari Actions.
4. Jalankan **Build Android** lagi. Hasilnya artifact `BlockZone-release-signed`:
   - `BlockZone-release.aab` → Play Store
   - `BlockZone-release.apk` → TapTap

## Ganti ke ID iklan asli

Settings → Secrets and variables → Actions → **Variables**:

| Variable | Isi |
|---|---|
| `ADMOB_APP_ID` | `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` |
| `ADMOB_INTERSTITIAL_ID` | ad unit interstitial |
| `ADMOB_REWARDED_ID` | ad unit rewarded |
| `ADMOB_TESTING` | `false` |

Selama variable kosong, build pakai ID test resmi Google (iklan test, aman).

## Aturan game yang bisa diubah (`www/index.html`)

- `LOSSES_PER_AD` = iklan muncul tiap berapa kali kalah (sekarang 3)
- `adUnlock` di item `attackspeed` = berapa iklan buat buka skill (sekarang 3)
- `ATKSPD` = `duration` (2 detik), `cooldown` (30 detik), `mult` (2x lebih cepat)

## Catatan

- `appId` di `capacitor.config.json` (`com.kyoko.squarezone`) jadi permanen setelah upload pertama ke Play Store. Ganti dulu kalau mau.
- Play Store minta privacy policy, form Data safety, dan deklarasi "app contains ads".
- Jangan klik iklan sendiri pakai ID asli (bisa kena ban AdMob). Buat tes, biarkan `ADMOB_TESTING=true`.
- Kalau game dibuka di browser biasa, iklan diganti simulasi (cuma buat ngetes alur).
